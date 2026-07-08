import { createServer } from "node:http";

const DEFAULT_PORT = Number(process.env.SIGNALROOM_MCP_DEMO_PORT || 8787);

export function buildDemoMcpResult(args = {}) {
  const channel = args.channel || "#signalroom-ai-mcp-test";
  return {
    messages: [
      {
        id: "mcp-github-1",
        ts: new Date().toISOString(),
        author: "GitHub MCP",
        channel: "github/issues",
        text: "Blocker: deployment waits on infra approval and rollback proof is not ready.",
        permalink: "https://github.example.test/signalroom/issues/42"
      },
      {
        id: "mcp-linear-1",
        ts: new Date().toISOString(),
        author: "Linear MCP",
        channel: "linear/project-risk",
        text: "Security review needs final approval and no owner is assigned.",
        permalink: "https://linear.example.test/SIG-17"
      }
    ],
    issues: [
      {
        id: "SIG-42",
        title: "Deployment waits on infra approval",
        owner: null,
        status: "blocked",
        priority: "high",
        due: null,
        url: "https://github.example.test/signalroom/issues/42"
      }
    ],
    docs: [
      {
        id: "doc-risk-1",
        title: "Launch rollback proof",
        status: "not_ready",
        owner: null,
        text: `Rollback proof for ${channel} is not ready.`,
        url: "https://docs.example.test/rollback-proof"
      }
    ],
    calendar: []
  };
}

export function handleMcpJsonRpc(payload) {
  if (payload?.method !== "tools/call") {
    return jsonRpcError(payload?.id, -32601, "Method not found");
  }
  const toolName = payload.params?.name;
  if (toolName !== "signalroom.project_context") {
    return jsonRpcError(payload.id, -32602, `Unknown tool: ${toolName}`);
  }
  return {
    jsonrpc: "2.0",
    id: payload.id,
    result: {
      structuredContent: buildDemoMcpResult(payload.params?.arguments || {})
    }
  };
}

export function startDemoMcpServer({ port = DEFAULT_PORT } = {}) {
  const server = createServer(async (request, response) => {
    if (request.method !== "POST") {
      response.writeHead(405, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Use POST JSON-RPC requests." }));
      return;
    }

    try {
      const payload = JSON.parse(await readBody(request));
      const result = handleMcpJsonRpc(payload);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(result));
    } catch (error) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify(jsonRpcError(null, -32700, error.message)));
    }
  });

  server.listen(port, () => {
    console.log(`SignalRoom demo MCP server running at http://127.0.0.1:${port}`);
    console.log("Tool: signalroom.project_context");
  });
  return server;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("error", reject);
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function jsonRpcError(id, code, message) {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startDemoMcpServer();
}
