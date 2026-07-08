import { analyzeLaunchReadiness, buildRescueBrief } from "../engine/riskEngine.js";

export function createSignalRoomTools({ slackClient, rtsProvider, mcpProvider, config }) {
  return {
    slack_search_context: async ({ actionToken, channelName, query }) => {
      if (!config.rtsEnabled || !rtsProvider) {
        return { messages: [], used: false, reason: "Real-Time Search is disabled or not configured." };
      }
      const messages = await rtsProvider.searchProjectContext({
        actionToken,
        query: query || defaultRiskQuery(channelName)
      });
      return { messages, used: true };
    },

    issue_tracker_lookup: async ({ project, channel, messages }) => {
      if (!config.mcpEnabled || !mcpProvider) {
        return { issues: [], docs: [], calendar: [], used: false, reason: "MCP is disabled or not configured." };
      }
      return {
        ...(await mcpProvider.getProjectContext({ project, channel, messages })),
        used: true
      };
    },

    create_rescue_brief: async ({ workspace }) => buildRescueBrief(workspace),

    post_rescue_summary: async ({ channelId, workspace }) => {
      const analysis = analyzeLaunchReadiness(workspace);
      const text = `SignalRoom rescue summary: risk ${analysis.riskScore}%, readiness ${analysis.readiness}%. ${analysis.recommendedActions[0]}`;
      if (!slackClient?.chat?.postMessage || !channelId) {
        return { posted: false, text };
      }
      await slackClient.chat.postMessage({ channel: channelId, text });
      return { posted: true, text };
    }
  };
}

function defaultRiskQuery(channelName = "") {
  return [
    channelName ? `in:${channelName.replace(/^#/, "")}` : "",
    "blocker failing delayed cannot start QA launch approval owner no owner backup overloaded dependency"
  ].filter(Boolean).join(" ");
}
