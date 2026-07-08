import assert from "node:assert/strict";
import test from "node:test";
import { signalRoomConfig } from "../src/config.js";

test("reads SignalRoom feature flags", () => {
  assert.deepEqual(signalRoomConfig({
    SIGNALROOM_AI_ENABLED: "true",
    SIGNALROOM_RTS_ENABLED: "1",
    SIGNALROOM_MCP_ENABLED: "false",
    SIGNALROOM_DEBUG: "yes"
  }), {
    aiEnabled: true,
    rtsEnabled: true,
    mcpEnabled: false,
    debug: true
  });
});
