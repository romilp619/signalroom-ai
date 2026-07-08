export function signalRoomConfig(env = process.env) {
  return {
    aiEnabled: flag(env.SIGNALROOM_AI_ENABLED, true),
    rtsEnabled: flag(env.SIGNALROOM_RTS_ENABLED, true),
    mcpEnabled: flag(env.SIGNALROOM_MCP_ENABLED, false),
    debug: flag(env.SIGNALROOM_DEBUG, false)
  };
}

export function debugLog(config, message, details) {
  if (!config?.debug) return;
  if (details === undefined) {
    console.log(`[SignalRoom] ${message}`);
    return;
  }
  console.log(`[SignalRoom] ${message}`, details);
}

function flag(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return /^(1|true|yes|on)$/i.test(String(value));
}
