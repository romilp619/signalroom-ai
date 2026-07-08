import { demoWorkspace } from "../data/demoWorkspace.js";
import { analyzeLaunchReadiness, buildDecisionTimeline, buildRescueBrief, buildWhatIfSimulation } from "../engine/riskEngine.js";
import { briefBlocks, helpBlocks, launchBlocks, timelineBlocks, whatIfBlocks } from "./blocks.js";

export function routeSignalRoomCommand(text, workspace = demoWorkspace) {
  const normalized = text.trim();

  if (!normalized || /^help$|^clean$|^clear$/i.test(normalized)) {
    return {
      response_type: "ephemeral",
      blocks: helpBlocks()
    };
  }

  if (/^launch|risk|readiness/i.test(normalized)) {
    return {
      response_type: "in_channel",
      blocks: launchBlocks(analyzeLaunchReadiness(workspace))
    };
  }

  if (/^whatif|^what if/i.test(normalized)) {
    const scenario = normalized.replace(/^what\s?if\s*/i, "").trim() || "payment slips 2 days";
    return {
      response_type: "in_channel",
      blocks: whatIfBlocks(buildWhatIfSimulation(workspace, scenario))
    };
  }

  if (/^timeline|decision/i.test(normalized)) {
    return {
      response_type: "in_channel",
      blocks: timelineBlocks(buildDecisionTimeline(workspace), {
        includeEvidence: /--evidence\b/i.test(normalized)
      })
    };
  }

  if (/^brief|rescue/i.test(normalized)) {
    return {
      response_type: "in_channel",
      blocks: briefBlocks(buildRescueBrief(workspace))
    };
  }

  return {
    response_type: "ephemeral",
    blocks: helpBlocks()
  };
}
