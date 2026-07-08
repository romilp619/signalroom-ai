import "dotenv/config";
import http from "node:http";
import { App, Assistant } from "@slack/bolt";
import { routeSignalRoomCommand } from "./slack/commandRouter.js";
import { workspaceFromSlackChannel } from "./providers/slackChannelWorkspace.js";
import { McpContextProvider } from "./providers/mcpContextProvider.js";
import { SlackRealtimeSearchProvider } from "./providers/slackRealtimeSearchProvider.js";
import { createSignalRoomAssistant } from "./slack/assistantAgent.js";
import { cleanSignalRoomMessages } from "./slack/cleaner.js";
import { debugLog, signalRoomConfig } from "./config.js";

const socketMode = Boolean(process.env.SLACK_APP_TOKEN);

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode,
  appToken: process.env.SLACK_APP_TOKEN
});
const config = signalRoomConfig(process.env);
const mcpProvider = config.mcpEnabled ? McpContextProvider.fromEnv(process.env) : null;
const rtsProvider = config.rtsEnabled ? new SlackRealtimeSearchProvider({ slackClient: app.client }) : null;

if (config.aiEnabled) {
  app.use(createSignalRoomAssistant({ AssistantClass: Assistant, mcpProvider, rtsProvider, config }).getMiddleware());
}

app.command("/signalroom", async ({ command, ack, respond, client }) => {
  await ack();

  if (/^clean|^clear/i.test(command.text.trim())) {
    try {
      const deleted = await cleanSignalRoomMessages({
        client,
        channelId: command.channel_id
      });
      await respond({
        response_type: "ephemeral",
        text: `Cleaned ${deleted} SignalRoom message${deleted === 1 ? "" : "s"} from this channel.`
      });
    } catch (error) {
      console.warn("Could not clean SignalRoom messages:", error.data?.error || error.message);
      await respond({
        response_type: "ephemeral",
        text: "I could not clean messages here. Make sure SignalRoom is installed in this channel and has chat permissions."
      });
    }
    return;
  }

  try {
    debugLog(config, "AI analyzer used", { command: command.text || "launch" });
    const workspace = await workspaceFromSlackChannel({
      client,
      channelId: command.channel_id,
      mcpProvider,
      rtsProvider,
      config
    });
    await postOrRespond({
      client,
      respond,
      channelId: command.channel_id,
      response: routeSignalRoomCommand(command.text, workspace)
    });
  } catch (error) {
    debugLog(config, "Slash command fallback used", error.message);
    console.warn("Falling back to demo workspace:", error.message);
    await postOrRespond({
      client,
      respond,
      channelId: command.channel_id,
      response: routeSignalRoomCommand(command.text)
    });
  }
});

app.event("app_mention", async ({ event, client }) => {
  const text = event.text.replace(/<@[^>]+>/g, "").trim() || "launch";
  let response;
  try {
    const workspace = await workspaceFromSlackChannel({
      client,
      channelId: event.channel,
      mcpProvider,
      rtsProvider,
      config
    });
    response = routeSignalRoomCommand(text, workspace);
  } catch (error) {
    debugLog(config, "App mention fallback used", error.message);
    response = routeSignalRoomCommand(text);
  }

  await client.chat.postMessage({
    channel: event.channel,
    thread_ts: event.ts,
    blocks: response.blocks,
    text: "SignalRoom risk radar"
  });
});

app.action(/signalroom_.*/, async ({ action, ack, respond, body, client }) => {
  await ack();

  const channelId = body.channel?.id || body.container?.channel_id;

  if (channelId) {
    try {
      const workspace = await workspaceFromSlackChannel({ client, channelId, mcpProvider, rtsProvider, config });
      await postOrRespond({
        client,
        respond,
        channelId,
        response: routeSignalRoomCommand(action.value || "launch", workspace)
      });
      return;
    } catch (error) {
      console.warn("Falling back to demo workspace for action:", error.message);
    }
  }

  await respond(routeSignalRoomCommand(action.value || "launch"));
});

async function postOrRespond({ client, respond, channelId, response }) {
  debugRenderedBlocks(response.blocks);
  if (response.response_type === "in_channel") {
    await client.chat.postMessage({
      channel: channelId,
      blocks: response.blocks,
      text: "SignalRoom"
    });
    return;
  }

  await respond(response);
}

function debugRenderedBlocks(blocks = []) {
  if (!config.debug) return;
  const lengths = blocks
    .filter((block) => block.type === "section" && block.text?.text)
    .map((block) => block.text.text.length);
  debugLog(config, "Slack response rendered", {
    originalMessageLength: lengths.reduce((total, length) => total + length, 0),
    chunks: lengths.length,
    maxChunkLength: Math.max(0, ...lengths)
  });
}

const port = Number(process.env.PORT || 3000);

if (socketMode) {
  const healthServer = http.createServer((request, response) => {
    if (request.url === "/healthz" || request.url === "/") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, service: "signalroom" }));
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false }));
  });

  healthServer.listen(port, () => {
    console.log(`SignalRoom health server is listening on port ${port}`);
  });

  await app.start();
} else {
  await app.start(port);
}

console.log(`SignalRoom is running on port ${port}`);
