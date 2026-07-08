import assert from "node:assert/strict";
import test from "node:test";
import { McpHttpClient, parseMcpToolResult } from "../src/providers/mcpHttpClient.js";
import { McpContextProvider } from "../src/providers/mcpContextProvider.js";

test("parses MCP structured and text tool results", () => {
  assert.deepEqual(parseMcpToolResult({
    structuredContent: {
      messages: [{ text: "API is blocked" }]
    }
  }), {
    messages: [{ text: "API is blocked" }]
  });

  assert.deepEqual(parseMcpToolResult({
    content: [{ type: "text", text: "{\"issues\":[{\"id\":\"GH-1\"}]}" }]
  }), {
    issues: [{ id: "GH-1" }]
  });
});

test("calls MCP project context tool and normalizes evidence messages", async () => {
  const client = new McpHttpClient({
    url: "https://mcp.example.test",
    token: "token",
    fetchImpl: async (url, request) => {
      assert.equal(url, "https://mcp.example.test");
      assert.equal(request.headers.authorization, "Bearer token");
      const body = JSON.parse(request.body);
      assert.equal(body.method, "tools/call");
      assert.equal(body.params.name, "signalroom.project_context");
      return {
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            structuredContent: {
              messages: [{
                source: "GitHub MCP",
                text: "Deployment waits on infra approval and no owner is assigned.",
                url: "https://github.example.test/issues/42"
              }]
            }
          }
        })
      };
    }
  });
  const provider = new McpContextProvider({ servers: [client] });
  const context = await provider.getProjectContext({
    project: { name: "Orion" },
    channel: "#orion",
    messages: []
  });

  assert.equal(context.messages.length, 1);
  assert.equal(context.messages[0].author, "GitHub MCP");
  assert.match(context.messages[0].text, /Deployment waits on infra approval/);
});
