import assert from "node:assert/strict";
import test from "node:test";
import { cleanSignalRoomMessages } from "../src/slack/cleaner.js";

test("cleans only SignalRoom messages", async () => {
  const deleted = [];
  const client = {
    auth: {
      test: async () => ({ user_id: "U_SIGNALROOM", bot_id: "B_SIGNALROOM" })
    },
    conversations: {
      history: async () => ({
        messages: [
          { ts: "1.0", user: "U_SIGNALROOM", text: "SignalRoom risk radar" },
          { ts: "2.0", user: "U_USER", text: "Project message" },
          { ts: "3.0", bot_id: "B_SIGNALROOM", username: "SignalRoom", text: "Atlas Launch rescue brief" },
          { ts: "4.0", user: "U_USER", text: "SignalRoom is a great demo" }
        ]
      })
    },
    chat: {
      delete: async ({ ts }) => deleted.push(ts)
    }
  };

  const count = await cleanSignalRoomMessages({ client, channelId: "C1" });

  assert.equal(count, 2);
  assert.deepEqual(deleted, ["1.0", "3.0"]);
});
