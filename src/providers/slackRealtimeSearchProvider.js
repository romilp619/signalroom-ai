/**
 * Provider boundary for Slack Real-Time Search through assistant.search.context.
 */
export class SlackRealtimeSearchProvider {
  constructor({ slackClient }) {
    this.slackClient = slackClient;
  }

  async searchProjectContext({ actionToken, query, limit = 20 }) {
    if (!this.slackClient?.assistant?.search?.context) {
      throw new Error("Slack assistant search client is not configured.");
    }
    if (!actionToken) {
      throw new Error("Slack assistant search requires an action token from the triggering event.");
    }

    const result = await this.slackClient.assistant.search.context({
      query: query || "Find recent project risks, blockers, decisions, missing owners, and launch dependencies.",
      action_token: actionToken,
      content_types: ["messages", "files", "channels"],
      channel_types: ["public_channel", "private_channel"],
      include_context_messages: true,
      limit
    });

    return normalizeAssistantSearchMessages(result.results?.messages || []);
  }
}

function normalizeAssistantSearchMessages(messages) {
  return messages.map((match, index) => ({
    id: match.message_ts || match.ts || `search-${index}`,
    ts: slackTsToIso(match.message_ts || match.ts),
    author: match.user_name || match.username || match.user || "Slack Search",
    channel: match.channel_name ? `#${match.channel_name}` : match.channel_id || "slack-search",
    text: match.content || match.text || "",
    permalink: match.permalink || ""
  })).filter((message) => message.text);
}

function slackTsToIso(ts) {
  const seconds = Number.parseFloat(ts);
  if (!Number.isFinite(seconds)) return new Date().toISOString();
  return new Date(seconds * 1000).toISOString();
}
