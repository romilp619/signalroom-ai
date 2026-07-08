import { routeSignalRoomCommand } from "./commandRouter.js";
import { workspaceFromSlackChannel } from "../providers/slackChannelWorkspace.js";
import { debugLog } from "../config.js";

export function createSignalRoomAssistant({ AssistantClass, mcpProvider, rtsProvider, config }) {
  if (!AssistantClass) {
    throw new Error("Slack Bolt Assistant class is required.");
  }
  return new AssistantClass({
    threadStarted: async ({ setSuggestedPrompts, setTitle }) => {
      await setTitle("SignalRoom risk analyst");
      await setSuggestedPrompts({
        title: "Ask SignalRoom",
        prompts: [
          { title: "Launch risk radar", message: "launch" },
          { title: "Simulate a slip", message: "whatif payment slips 2 days" },
          { title: "Decision timeline", message: "timeline" },
          { title: "Rescue brief", message: "brief" }
        ]
      });
    },

    threadContextChanged: async ({ saveThreadContext, setStatus }) => {
      await setStatus("Updating project context...");
      await saveThreadContext();
    },

    userMessage: async ({ client, event, say, setStatus, setTitle }) => {
      if (!config.aiEnabled) {
        await say("SignalRoom AI agent mode is disabled. Use `/signalroom launch` instead.");
        return;
      }

      const commandText = normalizeAssistantText(event.text);
      await setTitle("SignalRoom risk analysis");
      await setStatus("Searching Slack context...");
      debugLog(config, "AI analyzer used", { command: commandText });

      try {
        const workspace = await workspaceFromSlackChannel({
          client,
          channelId: event.channel,
          actionToken: extractActionToken(event),
          rtsProvider,
          mcpProvider,
          config
        });
        await setStatus("Analyzing project risks...");
        const response = routeSignalRoomCommand(commandText, workspace);
        await say({
          blocks: response.blocks,
          text: "SignalRoom risk radar"
        });
      } catch (error) {
        debugLog(config, "AI analyzer fallback used", error.message);
        const response = routeSignalRoomCommand(commandText);
        await say({
          blocks: response.blocks,
          text: "SignalRoom risk radar"
        });
      }
    }
  });
}

export function normalizeAssistantText(text = "") {
  const cleaned = text.replace(/<@[^>]+>/g, "").trim();
  if (!cleaned) return "launch";
  if (/risk|readiness|launch/i.test(cleaned)) return "launch";
  if (/what\s*if|slip|delay/i.test(cleaned)) return cleaned.startsWith("whatif") ? cleaned : `whatif ${cleaned}`;
  if (/timeline|decision/i.test(cleaned)) return "timeline";
  if (/brief|rescue/i.test(cleaned)) return "brief";
  return cleaned;
}

function extractActionToken(event = {}) {
  return event.assistant_thread?.context?.action_token
    || event.context?.action_token
    || event.action_token
    || null;
}
