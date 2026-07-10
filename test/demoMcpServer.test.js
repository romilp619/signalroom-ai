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

test("demo MCP server does not inject unrelated risks into arbitrary channels", () => {
  const response = handleMcpJsonRpc({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "signalroom.project_context",
      arguments: {
        channel: "#random-judge-test",
        recentMessages: [
          {
            text: "Payment owner is still checking invoice copy before launch."
          }
        ]
      }
    }
  });

  assert.equal(response.id, 2);
  assert.deepEqual(response.result.structuredContent.messages, []);
  assert.deepEqual(response.result.structuredContent.issues, []);
});

test("demo MCP server adds deployment context only when channel evidence matches", () => {
  const response = handleMcpJsonRpc({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "signalroom.project_context",
      arguments: {
        channel: "#random-judge-test",
        recentMessages: [
          {
            text: "Blocker: deployment waits on infra approval and rollback proof."
          }
        ]
      }
    }
  });

  assert.equal(response.id, 3);
  assert.equal(response.result.structuredContent.messages.length, 1);
  assert.match(response.result.structuredContent.messages[0].text, /deployment waits/i);
  assert.equal(response.result.structuredContent.issues[0].id, "SIG-42");
});
