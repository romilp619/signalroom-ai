import { createServer } from "node:http";

const DEFAULT_PORT = Number(process.env.SIGNALROOM_MCP_DEMO_PORT || 8787);

export function buildDemoMcpResult(args = {}) {
  const channel = args.channel || "#signalroom-ai-mcp-test";
  const recentText = (args.recentMessages || [])
    .filter(isTeamContextMessage)
    .map((message) => message.text || "")
    .join("\n");
  const isDedicatedMcpDemo = /signalroom-ai-mcp-test|new-plan/i.test(channel);
  const includeDeployment = isDedicatedMcpDemo || /deploy|deployment|infra|rollback/i.test(recentText);
  const includeSecurity = isDedicatedMcpDemo || /security/i.test(recentText);
  const messages = [];
  const issues = [];
  const docs = [];

  if (includeDeployment) {
    messages.push({
      id: "mcp-github-1",
      ts: new Date().toISOString(),
      author: "GitHub MCP",
      channel: "github/issues",
      text: "Blocker: deployment waits on infra approval and rollback proof is not ready.",
      permalink: "https://github.example.test/signalroom/issues/42"
    });
    issues.push({
      id: "SIG-42",
      title: "Deployment waits on infra approval",
      owner: null,
      status: "blocked",
      priority: "high",
      due: null,
      url: "https://github.example.test/signalroom/issues/42"
    });
    docs.push({
      id: "doc-risk-1",
      title: "Launch rollback proof",
      status: "not_ready",
      owner: null,
      text: `Rollback proof for ${channel} is not ready.`,
      url: "https://docs.example.test/rollback-proof"
    });
  }

  if (includeSecurity) {
    messages.push({
      id: "mcp-linear-1",
      ts: new Date().toISOString(),
      author: "Linear MCP",
      channel: "linear/project-risk",
      text: "Security review needs final approval and no owner is assigned.",
      permalink: "https://linear.example.test/SIG-17"
    });
  }

  return {
    messages,
    issues,
    docs,
    calendar: []
  };
}

function isTeamContextMessage(message = {}) {
  const text = (message.text || "").trim();
  const author = message.author || message.user || message.sender || "";
  if (!text) return false;
  if (/signalroom/i.test(author)) return false;
  if (/^\/signalroom\b/i.test(text)) return false;
  if (/cleaned \d+ signalroom messages/i.test(text)) return false;
  if (/signalroom (risk radar|what-if simulation|decision timeline)/i.test(text)) return false;
  if (/atlas launch rescue brief/i.test(text)) return false;
  if (/^\s*:?(rotating_light|test_tube|clock3):/i.test(text)) return false;
  return true;
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
