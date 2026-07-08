import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAssistantText } from "../src/slack/assistantAgent.js";

test("normalizes natural assistant messages to SignalRoom commands", () => {
  assert.equal(normalizeAssistantText("Can you check launch risk?"), "launch");
  assert.equal(normalizeAssistantText("payment slips 2 days"), "whatif payment slips 2 days");
  assert.equal(normalizeAssistantText("show decision timeline"), "timeline");
  assert.equal(normalizeAssistantText("create rescue brief"), "brief");
});
