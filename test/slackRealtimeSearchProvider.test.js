import assert from "node:assert/strict";
import test from "node:test";
import { SlackRealtimeSearchProvider } from "../src/providers/slackRealtimeSearchProvider.js";

test("uses assistant.search.context for Slack AI context retrieval", async () => {
  const calls = [];
  const provider = new SlackRealtimeSearchProvider({
    slackClient: {
      assistant: {
        search: {
          context: async (args) => {
            calls.push(args);
            return {
              results: {
                messages: [{
                  message_ts: "1782789220.500000",
                  user_name: "Asha",
                  channel_name: "proj-orion",
                  content: "Deployment waits on infra approval.",
                  permalink: "https://slack.example/archives/C123/p1782789220500000"
                }]
              }
            };
          }
        }
      }
    }
  });

  const messages = await provider.searchProjectContext({
    actionToken: "xoxe-action-token",
    query: "deployment approval risk"
  });

  assert.equal(calls[0].action_token, "xoxe-action-token");
  assert.deepEqual(calls[0].content_types, ["messages", "files", "channels"]);
  assert.equal(messages[0].author, "Asha");
  assert.equal(messages[0].channel, "#proj-orion");
  assert.match(messages[0].text, /Deployment waits/);
});
