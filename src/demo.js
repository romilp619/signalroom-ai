import { demoWorkspace } from "./data/demoWorkspace.js";
import { analyzeLaunchReadiness, buildDecisionTimeline, buildRescueBrief, buildWhatIfSimulation } from "./engine/riskEngine.js";

const launch = analyzeLaunchReadiness(demoWorkspace);
const whatIf = buildWhatIfSimulation(demoWorkspace, "payment slips 2 days");
const timeline = buildDecisionTimeline(demoWorkspace);
const brief = buildRescueBrief(demoWorkspace);

printTitle("SignalRoom: Launch Risk Radar");
console.log(`${launch.project.name} | Readiness ${launch.readiness}% | Risk ${launch.riskScore}% | ${launch.level.toUpperCase()}`);
console.log(launch.summary);
console.log("");

printTitle("Top Risks");
for (const signal of launch.signals.slice(0, 5)) {
  console.log(`- ${signal.title}`);
  console.log(`  ${signal.detail}`);
  console.log(`  Owner: ${signal.owner || "Needs owner"}`);
}

printTitle("Recommended Rescue Moves");
for (const action of launch.recommendedActions) {
  console.log(`- ${action}`);
}

printTitle("What If: payment slips 2 days");
console.log(`Risk ${whatIf.currentRisk}% -> ${whatIf.projectedRisk}% | Readiness ${whatIf.currentReadiness}% -> ${whatIf.projectedReadiness}%`);
console.log(whatIf.chainReaction.join(" -> "));

printTitle("Decision Timeline");
for (const item of timeline) {
  console.log(`- ${item.time}: [${item.type}] ${item.summary}`);
}

printTitle("Rescue Brief");
console.log(brief.summary);
for (const priority of brief.priorities) {
  console.log(`- ${priority.risk} -> ${priority.action}`);
}

function printTitle(title) {
  console.log("");
  console.log(title);
  console.log("=".repeat(title.length));
}
