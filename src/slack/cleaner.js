export async function cleanSignalRoomMessages({ client, channelId, limit = 100 }) {
  const auth = await client.auth.test();
  const history = await client.conversations.history({
    channel: channelId,
    limit
  });

  const messages = (history.messages || []).filter((message) =>
    isSignalRoomMessage(message, auth)
  );

  let deleted = 0;
  for (const message of messages) {
    try {
      await client.chat.delete({
        channel: channelId,
        ts: message.ts
      });
      deleted += 1;
    } catch (error) {
      if (!["message_not_found", "cant_delete_message"].includes(error.data?.error)) {
        console.warn("Could not delete SignalRoom message:", error.data?.error || error.message);
      }
    }
  }

  return deleted;
}

function isSignalRoomMessage(message, auth) {
  if (!message.ts) return false;
  if (message.user === auth.user_id) return true;
  if (auth.bot_id && message.bot_id === auth.bot_id) return true;
  return false;
}
