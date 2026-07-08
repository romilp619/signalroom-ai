import { demoWorkspace } from "../data/demoWorkspace.js";
import { debugLog, signalRoomConfig } from "../config.js";

export async function workspaceFromSlackChannel({ client, channelId, mcpProvider, rtsProvider, actionToken, config = signalRoomConfig() }) {
  const [channel, history] = await Promise.all([
    client.conversations.info({ channel: channelId }),
    client.conversations.history({
      channel: channelId,
      limit: 100,
      inclusive: true
    })
  ]);

  const usersById = await loadUsersById(client, history.messages || []);
  const channelName = channel.channel?.name ? `#${channel.channel.name}` : demoWorkspace.project.channel;
  const historyMessages = dedupeMessages((history.messages || [])
    .filter((message) => isHumanMessage(message))
    .map((message) => ({
      id: message.client_msg_id || message.ts,
      ts: slackTsToIso(message.ts),
      author: usersById.get(message.user) || message.username || "Unknown",
      channel: channelName,
      text: normalizeMessageText(stripSlackMarkup(message.text)),
      permalink: slackMessageUrl(channelName, message.ts)
    })))
    .reverse();
  const searchMessages = await getSearchMessages({
    rtsProvider,
    actionToken,
    channelName,
    config
  });
  const messages = dedupeMessages([...historyMessages, ...searchMessages]);
  const liveMessages = messages.length > 0 ? messages : demoWorkspace.messages;
  const owners = inferOwners(liveMessages);
  const project = {
    ...demoWorkspace.project,
    channel: channelName,
    owner: owners.Maya
  };
  const mcpContext = config.mcpEnabled && mcpProvider
    ? await mcpProvider.getProjectContext({ project, channel: channelName, messages: liveMessages })
    : { messages: [], issues: [], docs: [], calendar: [] };
  debugLog(config, config.mcpEnabled && mcpProvider ? "MCP tools used" : "MCP tools skipped");

  return {
    ...demoWorkspace,
    project,
    messages: [...liveMessages, ...mcpContext.messages],
    issues: [...remapIssueOwners(demoWorkspace.issues, owners), ...mcpContext.issues],
    docs: [...remapDocOwners(demoWorkspace.docs, owners), ...mcpContext.docs],
    calendar: [...demoWorkspace.calendar, ...mcpContext.calendar]
  };
}

async function getSearchMessages({ rtsProvider, actionToken, channelName, config }) {
  if (!config.rtsEnabled || !rtsProvider) {
    debugLog(config, "RTS search skipped; using channel history fallback");
    return [];
  }
  try {
    const messages = await rtsProvider.searchProjectContext({
      actionToken,
      query: riskSearchQuery(channelName)
    });
    debugLog(config, "RTS search used", { count: messages.length });
    return messages;
  } catch (error) {
    debugLog(config, "RTS search fallback used", error.message);
    return [];
  }
}

function riskSearchQuery(channelName) {
  return [
    `in:${channelName.replace(/^#/, "")}`,
    "blocker OR failing OR delayed OR \"cannot start\" OR QA OR launch OR approval OR owner OR \"no owner\" OR backup OR overloaded OR dependency"
  ].join(" ");
}

function isHumanMessage(message) {
  if (message.type !== "message") return false;
  if (!message.text) return false;
  if (message.subtype) return false;
  if (message.bot_id || message.app_id) return false;
  return Boolean(message.user);
}

async function loadUsersById(client, messages) {
  const ids = [...new Set(messages.map((message) => message.user).filter(Boolean))];
  const users = new Map();

  await Promise.all(
    ids.map(async (id) => {
      try {
        const result = await client.users.info({ user: id });
        const user = result.user;
        users.set(id, user?.profile?.display_name || user?.real_name || user?.name || id);
      } catch {
        users.set(id, id);
      }
    })
  );

  return users;
}

function slackTsToIso(ts) {
  const seconds = Number.parseFloat(ts);
  if (!Number.isFinite(seconds)) return new Date().toISOString();
  return new Date(seconds * 1000).toISOString();
}

function stripSlackMarkup(text) {
  return text
    .replace(/<@([A-Z0-9]+)>/g, "@$1")
    .replace(/<#([A-Z0-9]+)\|([^>]+)>/g, "#$2")
    .replace(/<([^|>]+)\|([^>]+)>/g, "$2")
    .replace(/<([^>]+)>/g, "$1");
}

function normalizeMessageText(text) {
  return text.trim().replace(/[']+$/g, "").trim();
}

function dedupeMessages(messages) {
  const seen = new Set();
  const deduped = [];

  for (const message of messages) {
    const key = normalizeMessageText(stripSlackMarkup(message.text)).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(message);
  }

  return deduped;
}

function slackMessageUrl(channelName, ts) {
  const normalized = channelName.replace(/^#/, "");
  const compactTs = String(ts).replace(".", "");
  return `slack://channel/${normalized}/p${compactTs}`;
}

function inferOwners(messages) {
  const firstAuthor = messages.find((message) => message.author !== "Unknown")?.author || "Project owner";
  const paymentOwner = messages.find((message) => /payment|webhook|auth QA/i.test(message.text))?.author || firstAuthor;
  const qaOwner = messages.find((message) => /QA|build candidate|checkout test/i.test(message.text))?.author || firstAuthor;
  const approvalOwner = messages.find((message) => /pricing|approval|signoff/i.test(message.text))?.author || firstAuthor;

  return {
    Maya: firstAuthor,
    Priya: paymentOwner,
    Leo: qaOwner,
    Sara: approvalOwner,
    Amir: firstAuthor
  };
}

function remapIssueOwners(issues, owners) {
  return issues.map((issue) => ({
    ...issue,
    owner: owners[issue.owner] || issue.owner
  }));
}

function remapDocOwners(docs, owners) {
  return docs.map((doc) => ({
    ...doc,
    owner: doc.owner ? owners[doc.owner] || doc.owner : doc.owner
  }));
}
