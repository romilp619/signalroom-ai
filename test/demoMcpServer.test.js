import assert from "node:assert/strict";
import test from "node:test";
import { handleMcpJsonRpc } from "../src/mcp/demoMcpServer.js";

test("demo MCP server returns SignalRoom project context", () => {
  const response = handleMcpJsonRpc({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "signalroom.project_context",
      arguments: {
        channel: "#signalroom-ai-mcp-test"
      }
    }
  });

  assert.equal(response.id, 1);
  assert.ok(response.result.structuredContent.messages.length >= 2);
  assert.match(response.result.structuredContent.messages[0].text, /Blocker:/);
  assert.equal(response.result.structuredContent.issues[0].id, "SIG-42");
});
