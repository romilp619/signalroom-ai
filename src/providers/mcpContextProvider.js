import { McpHttpClient } from "./mcpHttpClient.js";

export class McpContextProvider {
  constructor({ clients = {}, servers = [] } = {}) {
    this.clients = clients;
    this.servers = servers;
  }

  static fromEnv(env = process.env) {
    const urls = splitEnvList(env.MCP_SERVER_URLS || env.MCP_SERVER_URL);
    const tokens = splitEnvList(env.MCP_SERVER_TOKENS || env.MCP_AUTH_TOKEN);

    return new McpContextProvider({
      servers: urls.map((url, index) => new McpHttpClient({
        url,
        token: tokens[index] || tokens[0]
      }))
    });
  }

  async getProjectContext({ project, channel, messages = [] } = {}) {
    const serverContexts = await Promise.all(
      this.servers.map((server) => this.safeCall(server, "signalroom.project_context", {
        project,
        channel,
        recentMessages: messages.slice(-20)
      }))
    );

    return mergeMcpContexts([
      ...serverContexts,
      {
        issues: await this.getIssues(),
        docs: await this.getDocs(),
        calendar: await this.getCalendarEvents()
      }
    ]);
  }

  async getIssues() {
    const githubIssues = this.clients.github?.listLaunchIssues
      ? await this.clients.github.listLaunchIssues()
      : [];
    const linearIssues = this.clients.linear?.listLaunchIssues
      ? await this.clients.linear.listLaunchIssues()
      : [];

    return [...githubIssues, ...linearIssues];
  }

  async getDocs() {
    const notionDocs = this.clients.notion?.listLaunchDocs
      ? await this.clients.notion.listLaunchDocs()
      : [];
    const driveDocs = this.clients.drive?.listLaunchDocs
      ? await this.clients.drive.listLaunchDocs()
      : [];

    return [...notionDocs, ...driveDocs];
  }

  async getCalendarEvents() {
    return this.clients.calendar?.listLaunchEvents
      ? this.clients.calendar.listLaunchEvents()
      : [];
  }

  async safeCall(server, toolName, args) {
    try {
      return await server.callTool(toolName, args);
    } catch (error) {
      console.warn(`MCP tool ${toolName} failed:`, error.message);
      return {};
    }
  }
}

function mergeMcpContexts(contexts) {
  return contexts.reduce((merged, context) => ({
    messages: [...merged.messages, ...normalizeMcpMessages(context.messages || [])],
    issues: [...merged.issues, ...(context.issues || [])],
    docs: [...merged.docs, ...(context.docs || [])],
    calendar: [...merged.calendar, ...(context.calendar || context.events || [])]
  }), {
    messages: [],
    issues: [],
    docs: [],
    calendar: []
  });
}

function normalizeMcpMessages(messages) {
  return messages.map((message, index) => ({
    id: message.id || `mcp-${index}`,
    ts: message.ts || message.time || new Date().toISOString(),
    author: message.author || message.sender || message.source || "MCP",
    channel: message.channel || message.source || "mcp",
    text: message.text || message.summary || "",
    permalink: message.permalink || message.url || ""
  })).filter((message) => message.text);
}

function splitEnvList(value = "") {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
