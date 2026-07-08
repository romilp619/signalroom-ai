import assert from "node:assert/strict";
import test from "node:test";
import { createSignalRoomTools } from "../src/mcp/signalRoomTools.js";
import { demoWorkspace } from "../src/data/demoWorkspace.js";

test("exposes MCP-style SignalRoom tools", async () => {
  const tools = createSignalRoomTools({
    rtsProvider: {
      searchProjectContext: async () => [{ text: "API is blocked", author: "Asha" }]
    },
    mcpProvider: {
      getProjectContext: async () => ({
        issues: [{ id: "ISS-1", title: "Infra approval" }],
        messages: [],
        docs: [],
        calendar: []
      })
    },
    config: {
      rtsEnabled: true,
      mcpEnabled: true
    }
  });

  const search = await tools.slack_search_context({
    actionToken: "token",
    channelName: "#proj-orion"
  });
  const issues = await tools.issue_tracker_lookup({
    project: demoWorkspace.project,
    channel: "#proj-orion",
    messages: []
  });
  const brief = await tools.create_rescue_brief({ workspace: demoWorkspace });

  assert.equal(search.used, true);
  assert.equal(search.messages.length, 1);
  assert.equal(issues.used, true);
  assert.equal(issues.issues[0].id, "ISS-1");
  assert.equal(brief.title, "Atlas Launch rescue brief");
});
