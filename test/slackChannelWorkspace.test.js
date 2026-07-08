import assert from "node:assert/strict";
import test from "node:test";
import { workspaceFromSlackChannel } from "../src/providers/slackChannelWorkspace.js";

test("builds workspace messages from Slack channel history", async () => {
  const client = {
    conversations: {
      info: async () => ({ channel: { name: "proj-atlas-launch" } }),
      history: async () => ({
        messages: [
          {
            type: "message",
            ts: "1782789240.409149",
            user: "U1",
            text: "QA cannot start until Friday morning because the build candidate is not frozen yet.'"
          },
          {
            type: "message",
            ts: "1782789239.509149",
            user: "U1",
            text: "QA cannot start until Friday morning because the build candidate is not frozen yet."
          },
          {
            type: "message",
            ts: "1782789239.409149",
            user: "U1",
            text: "I own payment webhook, auth QA, launch checklist, and rollback plan today. Backup would help."
          },
          {
            type: "message",
            ts: "1782789220.508649",
            user: "U1",
            text: "Decision: we are keeping the public launch date at Friday unless payment or QA changes."
          }
        ]
      })
    },
    users: {
      info: async () => ({ user: { profile: { display_name: "Romil" } } })
    }
  };

  const workspace = await workspaceFromSlackChannel({ client, channelId: "C1" });

  assert.equal(workspace.project.channel, "#proj-atlas-launch");
  assert.equal(workspace.messages.length, 3);
  assert.equal(workspace.messages[0].author, "Romil");
  assert.match(workspace.messages[0].text, /Decision:/);
  assert.equal(workspace.messages.filter((message) => /QA cannot start/.test(message.text)).length, 1);
  assert.ok(workspace.messages.every((message) => !message.text.endsWith("'")));
  assert.ok(workspace.issues.every((issue) => issue.owner === "Romil"));
});

test("merges Real-Time Search evidence when action token is available", async () => {
  const client = {
    conversations: {
      info: async () => ({ channel: { name: "proj-orion" } }),
      history: async () => ({ messages: [] })
    },
    users: {
      info: async () => ({ user: { profile: { display_name: "Romil" } } })
    }
  };
  const rtsProvider = {
    searchProjectContext: async ({ actionToken, query }) => {
      assert.equal(actionToken, "xoxe-action-token");
      assert.match(query, /blocker/);
      return [{
        id: "rts-1",
        ts: "2026-06-30T09:00:00+05:30",
        author: "Asha",
        channel: "#proj-orion",
        text: "Frontend waits on API contract and no owner is assigned.",
        permalink: "https://slack.example/rts-1"
      }];
    }
  };

  const workspace = await workspaceFromSlackChannel({
    client,
    channelId: "C1",
    rtsProvider,
    actionToken: "xoxe-action-token",
    config: {
      rtsEnabled: true,
      mcpEnabled: false,
      debug: false
    }
  });

  assert.ok(workspace.messages.some((message) => /Frontend waits/.test(message.text)));
});
