import assert from "node:assert/strict";
import test from "node:test";
import { routeSignalRoomCommand } from "../src/slack/commandRouter.js";
import { chunkMrkdwnText } from "../src/slack/blocks.js";

test("routes launch command to in-channel risk radar", () => {
  const response = routeSignalRoomCommand("launch");

  assert.equal(response.response_type, "in_channel");
  assert.ok(JSON.stringify(response.blocks).includes("Risk score"));
  assert.ok(JSON.stringify(response.blocks).includes("SignalRoom detected"));
  assert.ok(JSON.stringify(response.blocks).includes("8 project messages"));
  assert.ok(JSON.stringify(response.blocks).includes("Rescue mode"));
  assert.ok(JSON.stringify(response.blocks).includes("\\n\\n"));

  const sectionBlocks = response.blocks.filter((block) => block.type === "section");
  assert.equal(sectionBlocks.length, 1);

  const renderedText = sectionBlocks
    .map((block) => {
      assert.ok(block.text.text.length < 3000);
      return block.text.text;
    })
    .join("");

  assert.ok(renderedText.length < 2800);
  assert.match(renderedText, /\*Status:\* .+ CRITICAL RISK/);
  assert.match(renderedText, /Risk score:\* \d+%\n\nSignalRoom detected/);
  assert.ok(renderedText.includes("Showing top *3* of *5* detected launch risks."));
  assert.match(renderedText, /8 project messages\*\.\n\nShowing top \*3\* of \*5\*/);
  assert.match(renderedText, /rescue review today\.\n\n.+\*Why this is risky\*/);
  assert.match(renderedText, /unresolved\.\n\n.+\*Top evidence-backed risks\*/);
  assert.match(renderedText, /\*Top evidence-backed risks\*\n\n\*1\. /);
  assert.ok(renderedText.includes("*2. Decision conflict"));
  assert.ok(renderedText.includes("*3. Missing owner"));
  assert.ok(!renderedText.includes("*4. Blocker"));
  assert.ok(!renderedText.includes("*5. QA dependency"));
  assert.match(renderedText, /.+\*Recommended rescue moves\*/);
  assert.ok(renderedText.includes("I own payment webhook, auth QA, launch checklist, and rollback"));
  assert.ok(!renderedText.includes("QA cannot start until Friday morning because the build candidate"));
  assert.doesNotMatch(renderedText, /pricing page copy final approval[\s\S]*\n\n\*4\. Blocker/);
  assert.doesNotMatch(renderedText, /payment webhook retries[\s\S]*\n\n\*5\. QA dependency/);
  assert.match(renderedText, /\*2\. Decision conflict[\s\S]*\n\n\*3\. Missing owner/);
  assert.match(renderedText, /\*3\. Missing owner[\s\S]*\n\n.+\*Recommended rescue moves/);
  assert.doesNotMatch(renderedText, /"\*Recommended rescue moves/);
  assert.match(renderedText, /.+ \*Priya\* in \*#proj-atlas-launch\*/);
});

test("escapes Slack control characters in dynamic mrkdwn text", () => {
  const workspace = {
    project: {
      name: "Atlas <Launch> & Growth",
      launchDate: "2026-07-05",
      today: "2026-06-30",
      channel: "#escape-test",
      owner: "Romil & Team"
    },
    messages: [
      {
        id: "e1",
        ts: "2026-06-30T10:00:00+05:30",
        author: "Romil <Lead> & Team",
        channel: "#escape-test",
        text: "Blocker: API <v2> & auth is failing. @channel should not be parsed by SignalRoom.",
        permalink: "slack://channel/escape-test/e1"
      }
    ],
    issues: [],
    docs: [],
    calendar: []
  };

  const response = routeSignalRoomCommand("launch", workspace);
  const sectionBlocks = response.blocks.filter((block) => block.type === "section");
  const renderedText = sectionBlocks.map((block) => block.text.text).join("");

  assert.ok(sectionBlocks.every((block) => block.text.verbatim === undefined));
  assert.ok(renderedText.includes("Atlas &lt;Launch&gt; &amp; Growth"));
  assert.ok(renderedText.includes("Romil &lt;Lead&gt; &amp; Team"));
  assert.ok(renderedText.includes("API &lt;v2&gt; &amp; auth is failing"));
});

test("chunks long mrkdwn safely under Slack section limits", () => {
  const longText = Array.from({ length: 160 }, (_, index) =>
    `Risk ${index}: Blocker evidence shows deployment is delayed and owner is missing.`
  ).join("\n\n");

  const chunks = chunkMrkdwnText(longText, 2900);

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 2900));
  assert.ok(chunks.every((chunk) => !chunk.startsWith(" ")));
  assert.ok(chunks.every((chunk) => !chunk.endsWith(" ")));
});

test("routes what-if command to scenario simulation", () => {
  const response = routeSignalRoomCommand("whatif payment slips 2 days");
  const renderedText = response.blocks
    .filter((block) => block.type === "section")
    .map((block) => block.text.text)
    .join("");

  assert.equal(response.response_type, "in_channel");
  assert.ok(renderedText.includes("SignalRoom What-if Simulation"));
  assert.ok(renderedText.includes("payment slips 2 days"));
  assert.ok(renderedText.includes("*Affected dependencies*"));
  assert.ok(renderedText.includes("*Best rescue move*"));
  assert.ok(!renderedText.includes("*Evidence:*"));
});

test("routes timeline command to compact timeline by default", () => {
  const response = routeSignalRoomCommand("timeline");
  const renderedText = response.blocks
    .filter((block) => block.type === "section")
    .map((block) => block.text.text)
    .join("");

  assert.equal(response.response_type, "in_channel");
  assert.ok(renderedText.includes("SignalRoom Decision Timeline"));
  assert.ok(renderedText.includes("•"));
  assert.ok(renderedText.includes("Run `/signalroom timeline --evidence`"));
  assert.ok(!renderedText.includes("*Evidence:*"));
});

test("routes timeline evidence flag to full evidence timeline", () => {
  const response = routeSignalRoomCommand("timeline --evidence");
  const renderedText = response.blocks
    .filter((block) => block.type === "section")
    .map((block) => block.text.text)
    .join("");

  assert.equal(response.response_type, "in_channel");
  assert.ok(renderedText.includes("SignalRoom Decision Timeline"));
  assert.ok(renderedText.includes("*Evidence:*"));
});

test("deduplicates compact timeline events across Slack and MCP", () => {
  const workspace = {
    project: {
      name: "Atlas Launch",
      launchDate: "2026-07-05",
      today: "2026-06-30",
      channel: "#new-plan",
      owner: "Romil Patel"
    },
    messages: [
      {
        id: "t1",
        ts: "2026-06-30T16:45:00+05:30",
        author: "Romil Patel",
        channel: "#new-plan",
        text: "Blocker: deployment waits on infra approval and rollback proof is not ready.",
        permalink: "slack://channel/new-plan/t1"
      },
      {
        id: "t2",
        ts: "2026-06-30T16:46:00+05:30",
        author: "Romil Patel",
        channel: "#new-plan",
        text: "Blocker: deployment waits on infra approval and rollback proof is not ready. Staging deploy is unstable.",
        permalink: "slack://channel/new-plan/t2"
      },
      {
        id: "t3",
        ts: "2026-06-30T18:10:00+05:30",
        author: "GitHub MCP",
        channel: "github/issues",
        text: "Blocker: deployment waits on infra approval and rollback proof is not ready.",
        permalink: "github://issues/t3"
      },
      {
        id: "t4",
        ts: "2026-06-30T16:45:30+05:30",
        author: "Romil Patel",
        channel: "#new-plan",
        text: "Security review needs final approval and no owner is assigned yet.",
        permalink: "slack://channel/new-plan/t4"
      },
      {
        id: "t5",
        ts: "2026-06-30T18:11:00+05:30",
        author: "Linear MCP",
        channel: "linear/project-risk",
        text: "Security review needs final approval and no owner is assigned.",
        permalink: "linear://project-risk/t5"
      }
    ],
    issues: [],
    docs: [],
    calendar: []
  };

  const response = routeSignalRoomCommand("timeline", workspace);
  const renderedText = response.blocks
    .filter((block) => block.type === "section")
    .map((block) => block.text.text)
    .join("");

  assert.equal(countMatches(renderedText, /Deployment waits on infra approval and rollback proof/g), 1);
  assert.equal(countMatches(renderedText, /Security review final approval/g), 1);
  assert.ok(renderedText.includes("(also confirmed by MCP)"));
});

test("routes brief command to compact rescue brief", () => {
  const response = routeSignalRoomCommand("brief");
  const renderedText = response.blocks
    .filter((block) => block.type === "section")
    .map((block) => block.text.text)
    .join("");

  assert.equal(response.response_type, "in_channel");
  assert.ok(renderedText.includes("Atlas Launch Rescue Brief"));
  assert.ok(renderedText.includes("*Top 3 rescue priorities*"));
  assert.ok(renderedText.includes("*Evidence:* \""));
  assert.ok(!renderedText.includes("*Expected impact:*"));
});

function countMatches(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

test("routes unknown command to help", () => {
  const response = routeSignalRoomCommand("something else");

  assert.equal(response.response_type, "ephemeral");
  assert.ok(JSON.stringify(response.blocks).includes("/signalroom launch"));
});
