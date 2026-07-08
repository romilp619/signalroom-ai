export class McpHttpClient {
  constructor({ url, token, fetchImpl = fetch }) {
    if (!url) throw new Error("MCP server URL is required.");
    this.url = url;
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.nextId = 1;
  }

  async callTool(name, args = {}) {
    const result = await this.request("tools/call", {
      name,
      arguments: args
    });

    return parseMcpToolResult(result);
  }

  async request(method, params = {}) {
    const response = await this.fetchImpl(this.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {})
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: this.nextId++,
        method,
        params
      })
    });

    if (!response.ok) {
      throw new Error(`MCP request failed with HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (payload.error) {
      throw new Error(payload.error.message || "MCP server returned an error.");
    }

    return payload.result;
  }
}

export function parseMcpToolResult(result) {
  if (!result) return {};
  if (result.structuredContent) return result.structuredContent;
  if (result.content?.length) {
    const text = result.content
      .filter((item) => item.type === "text" && item.text)
      .map((item) => item.text)
      .join("\n")
      .trim();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { messages: [{ text, source: "mcp" }] };
    }
  }
  return result;
}
