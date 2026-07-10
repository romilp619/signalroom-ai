import assert from "node:assert/strict";
import test from "node:test";
import { demoWorkspace } from "../src/data/demoWorkspace.js";
import { analyzeLaunchReadiness, buildDecisionTimeline, buildRescueBrief, buildWhatIfSimulation } from "../src/engine/riskEngine.js";

test("analyzes launch readiness with high risk signals", () => {
  const analysis = analyzeLaunchReadiness(demoWorkspace);

  assert.equal(analysis.project.name, "Atlas Launch");
  assert.equal(analysis.level, "critical");
  assert.ok(analysis.riskScore >= 75);
  assert.equal(analysis.messageCount, 8);
  assert.ok(analysis.signals.some((signal) => signal.type === "decision_conflict"));
  assert.ok(analysis.signals.some((signal) => signal.type === "owner_overload"));
  assert.ok(analysis.signals.some((signal) => signal.type === "missing_owner"));
  assert.ok(!analysis.signals.some((signal) => signal.title === "Fixed launch date has unresolved dependencies"));
  assert.ok(analysis.signals.every((signal) => signal.evidence.length > 0));
  assert.ok(analysis.recommendedActions.length >= 4);
});

test("what-if scenario projects risk with chain reaction", () => {
  const scenario = buildWhatIfSimulation(demoWorkspace, "payment slips 2 days");

  assert.ok(scenario.projectedRisk >= scenario.currentRisk);
  assert.ok(scenario.chainReaction.length >= 3);
  assert.ok(scenario.evidence.length > 0);
  assert.match(scenario.evidence[0].quote, /payment webhook retries/i);
});

test("what-if scenario grounds deployment slip in deployment evidence", () => {
  const workspace = {
    project: {
      name: "Orion Release",
      launchDate: "2026-07-04",
      today: "2026-06-30",
      channel: "#proj-orion",
      owner: "Dana"
    },
    messages: [
      {
        id: "d1",
        ts: "2026-06-30T09:00:00+05:30",
        author: "Dana",
        channel: "#proj-orion",
        text: "Decision: release date is locked for Thursday unless API or deployment changes.",
        permalink: "slack://channel/proj-orion/d1"
      },
      {
        id: "d2",
        ts: "2026-06-30T09:10:00+05:30",
        author: "GitHub MCP",
        channel: "github/issues",
        text: "Blocker: deployment waits on infra approval and rollback proof is not ready.",
        permalink: "https://github.com/example/orion/issues/44"
      },
      {
        id: "d3",
        ts: "2026-06-30T09:15:00+05:30",
        author: "Mira",
        channel: "#proj-orion",
        text: "Payment copy is approved and checkout validation is complete.",
        permalink: "slack://channel/proj-orion/d3"
      }
    ],
    issues: [],
    docs: [],
    calendar: []
  };

  const scenario = buildWhatIfSimulation(workspace, "deployment slips 2 days");

  assert.equal(scenario.confidence, "High");
  assert.deepEqual(scenario.affectedDependencies, ["staging deploy", "infra approval", "rollback proof", "release readiness"]);
  assert.match(scenario.chainReaction.join(" "), /Deployment remains blocked on infra approval/i);
  assert.match(scenario.bestRescueMove, /infra approval owner.*rollback proof/i);
  assert.match(scenario.evidence[0].quote, /deployment waits on infra approval/i);
  assert.equal(scenario.evidence[0].sender, "GitHub MCP");
  assert.ok(!scenario.affectedDependencies.some((item) => /payment|checkout|qa signoff/i.test(item)));
});

test("what-if scenario stays low confidence when topic has no direct evidence", () => {
  const workspace = {
    project: {
      name: "Orion Release",
      launchDate: "2026-07-04",
      today: "2026-06-30",
      channel: "#proj-orion",
      owner: "Dana"
    },
    messages: [
      {
        id: "u1",
        ts: "2026-06-30T09:00:00+05:30",
        author: "Dana",
        channel: "#proj-orion",
        text: "Decision: release date is locked for Thursday unless API or deployment changes.",
        permalink: "slack://channel/proj-orion/u1"
      },
      {
        id: "u2",
        ts: "2026-06-30T09:10:00+05:30",
        author: "Ravi",
        channel: "#proj-orion",
        text: "Frontend waits on API contract before checkout screens can be finished.",
        permalink: "slack://channel/proj-orion/u2"
      },
      {
        id: "u3",
        ts: "2026-06-30T09:15:00+05:30",
        author: "GitHub MCP",
        channel: "github/issues",
        text: "Blocker: deployment waits on infra approval and rollback proof is not ready.",
        permalink: "https://github.com/example/orion/issues/44"
      },
      {
        id: "u4",
        ts: "2026-06-30T09:20:00+05:30",
        author: "Mira",
        channel: "#proj-orion",
        text: "Security review needs final approval and no owner is assigned yet.",
        permalink: "slack://channel/proj-orion/u4"
      }
    ],
    issues: [],
    docs: [],
    calendar: []
  };

  const scenario = buildWhatIfSimulation(workspace, "payment slips 2 days");

  assert.equal(scenario.confidence, "Low");
  assert.equal(scenario.projectedRisk, Math.min(95, scenario.currentRisk + 1));
  assert.match(scenario.affectedDependencies[0], /No direct evidence found for payment/i);
  assert.match(scenario.bestRescueMove, /Confirm whether payment is in launch scope/i);
  assert.ok(scenario.affectedDependencies.length <= 4);
  assert.equal(
    scenario.affectedDependencies.filter((item) => /API contract is blocking checkout screens/i.test(item)).length,
    1
  );
  assert.ok(scenario.affectedDependencies.some((item) => /Deployment waits on infra approval/i.test(item)));
  assert.ok(scenario.affectedDependencies.some((item) => /Security review approval has no owner/i.test(item)));
  assert.ok(!scenario.affectedDependencies.some((item) => /payment webhook|checkout validation|qa signoff/i.test(item)));
});

test("builds decision timeline", () => {
  const timeline = buildDecisionTimeline(demoWorkspace);

  assert.ok(timeline.length >= 2);
  assert.ok(timeline.every((item) => item.evidence.source === "slack"));
});

test("builds rescue brief priorities", () => {
  const brief = buildRescueBrief(demoWorkspace);

  assert.equal(brief.title, "Atlas Launch rescue brief");
  assert.ok(brief.priorities.length > 0);
  assert.ok(brief.priorities.length <= 3);
  assert.ok(brief.nextMeeting);
});

test("classifies project risks from generic Slack messages", () => {
  const workspace = {
    project: {
      name: "Orion Release",
      launchDate: "2026-07-04",
      today: "2026-06-30",
      channel: "#proj-orion",
      owner: "Dana"
    },
    messages: [
      {
        id: "g1",
        ts: "2026-06-30T09:00:00+05:30",
        author: "Dana",
        channel: "#proj-orion",
        text: "Decision: release date is locked for Thursday, but API stability may change the plan.",
        permalink: "slack://channel/proj-orion/g1"
      },
      {
        id: "g2",
        ts: "2026-06-30T09:10:00+05:30",
        author: "Ravi",
        channel: "#proj-orion",
        text: "Frontend waits on API contract before we can finish checkout screens.",
        permalink: "slack://channel/proj-orion/g2"
      },
      {
        id: "g3",
        ts: "2026-06-30T09:15:00+05:30",
        author: "Nina",
        channel: "#proj-orion",
        text: "Staging deploy is unstable and rollback is not ready.",
        permalink: "slack://channel/proj-orion/g3"
      },
      {
        id: "g4",
        ts: "2026-06-30T09:20:00+05:30",
        author: "Asha",
        channel: "#proj-orion",
        text: "Security review needs final approval and no owner is assigned yet.",
        permalink: "slack://channel/proj-orion/g4"
      },
      {
        id: "g5",
        ts: "2026-06-30T09:30:00+05:30",
        author: "Ravi",
        channel: "#proj-orion",
        text: "I'm handling API contract, checkout screens, release notes, and smoke tests. Too much on my plate.",
        permalink: "slack://channel/proj-orion/g5"
      }
    ],
    issues: [],
    docs: [],
    calendar: []
  };

  const analysis = analyzeLaunchReadiness(workspace);
  const types = new Set(analysis.signals.map((signal) => signal.type));

  assert.ok(types.has("blocker"));
  assert.ok(types.has("dependency"));
  assert.ok(types.has("missing_owner"));
  assert.ok(types.has("owner_overload"));
  assert.ok(types.has("decision_conflict"));
  assert.ok(analysis.signals.every((signal) => signal.evidence.length > 0));
  assert.ok(!analysis.signals.some((signal) => /payment webhook|pricing final signoff/i.test(signal.title)));
  assert.ok(analysis.signals.some((signal) => /frontend|api|staging|security|ravi/i.test(`${signal.title} ${signal.owner}`)));
  assert.ok(analysis.signals.some((signal) => signal.title === "Missing owner: security review final approval"));
  assert.ok(!analysis.signals.some((signal) => signal.type === "blocker" && /release date is locked/i.test(signal.evidence[0].quote)));
});

test("produces judge-friendly risks for a new project channel", () => {
  const workspace = {
    project: {
      name: "Atlas Launch",
      launchDate: "2026-07-05",
      today: "2026-06-30",
      channel: "#new-plan",
      owner: "Romil Patel"
    },
    messages: [
      {
        id: "n1",
        ts: "2026-06-30T16:45:00+05:30",
        author: "Romil Patel",
        channel: "#new-plan",
        text: "Decision: release date is locked for Thursday unless API, deployment, or security approval changes.",
        permalink: "slack://channel/new-plan/n1"
      },
      {
        id: "n2",
        ts: "2026-06-30T16:45:10+05:30",
        author: "Romil Patel",
        channel: "#new-plan",
        text: "Frontend waits on the API contract before checkout screens can be finished. The API shape changed yesterday and the frontend team cannot finish validation until the contract is frozen.",
        permalink: "slack://channel/new-plan/n2"
      },
      {
        id: "n3",
        ts: "2026-06-30T16:45:20+05:30",
        author: "Romil Patel",
        channel: "#new-plan",
        text: "Blocker: deployment waits on infra approval and rollback proof is not ready. Staging deploy is unstable and the release owner does not want to promote without recovery proof.",
        permalink: "slack://channel/new-plan/n3"
      },
      {
        id: "n4",
        ts: "2026-06-30T16:45:21+05:30",
        author: "Romil Patel",
        channel: "#new-plan",
        text: "Blocker: deployment waits on infra approval and rollback proof is not ready. Staging deploy is unstable and the release owner does not want to promote without recovery proof.",
        permalink: "slack://channel/new-plan/n4"
      },
      {
        id: "n5",
        ts: "2026-06-30T16:45:30+05:30",
        author: "Romil Patel",
        channel: "#new-plan",
        text: "Security review needs final approval and no owner is assigned yet. The team still needs signoff before release notes and customer comms can be finalized.",
        permalink: "slack://channel/new-plan/n5"
      },
      {
        id: "n6",
        ts: "2026-06-30T16:45:40+05:30",
        author: "Romil Patel",
        channel: "#new-plan",
        text: "I am handling API contract, checkout screens, release notes, smoke tests, and deployment checklist today. Backup would help because too many launch-critical items are on one person.",
        permalink: "slack://channel/new-plan/n6"
      },
      {
        id: "n7",
        ts: "2026-06-30T16:46:00+05:30",
        author: "Romil Patel",
        channel: "#new-plan",
        text: "QA cannot start full regression until the build candidate is frozen. If API and deployment both move, QA will only have a few hours before the Thursday launch review.",
        permalink: "slack://channel/new-plan/n7"
      },
      {
        id: "n8",
        ts: "2026-06-30T16:46:10+05:30",
        author: "Romil Patel",
        channel: "#new-plan",
        text: "Customer comms are waiting on security approval and final release scope. Nobody has confirmed who owns the final signoff for the announcement.",
        permalink: "slack://channel/new-plan/n8"
      },
      {
        id: "n9",
        ts: "2026-06-30T16:46:20+05:30",
        author: "Romil Patel",
        channel: "#new-plan",
        text: "Infra says rollback proof needs one more staging drill. If the drill fails, deployment cannot be approved for Thursday.",
        permalink: "slack://channel/new-plan/n9"
      }
    ],
    issues: [],
    docs: [],
    calendar: []
  };

  const analysis = analyzeLaunchReadiness(workspace);
  const topFive = analysis.signals.slice(0, 5);
  const titles = topFive.map((signal) => signal.title);

  assert.equal(analysis.messageCount, 8);
  assert.ok(titles.includes("Missing owner: security review final approval"));
  assert.ok(titles.includes("Missing owner: customer comms final signoff"));
  assert.ok(titles.includes("Decision conflict: Thursday release is locked while API contract blocks checkout completion"));
  assert.ok(titles.includes("Blocker: deployment waits on infra approval and rollback proof is not ready"));
  assert.ok(!topFive.some((signal) => signal.title === "QA dependency: build candidate is not frozen"));

  const deployment = analysis.signals.find((signal) => /deployment waits on infra approval/i.test(signal.title));
  assert.equal(deployment.owner, "Infra / Release owner");
  assert.equal(deployment.recommendedAction, "Assign an infra approval owner and require rollback proof before launch review.");

  const security = analysis.signals.find((signal) => signal.title === "Missing owner: security review final approval");
  assert.equal(security.owner, "Missing");
  assert.equal(security.recommendedAction, "Name one security approval owner and set a signoff deadline today.");

  const customerComms = analysis.signals.find((signal) => signal.title === "Missing owner: customer comms final signoff");
  assert.equal(customerComms.owner, "Missing");
  assert.equal(customerComms.recommendedAction, "Name one customer comms signoff owner and deadline today.");

  const apiDependency = analysis.signals.find((signal) => signal.title === "QA dependency: API contract blocks checkout completion");
  assert.equal(apiDependency.recommendedAction, "Freeze the API contract or split checkout work into blocked and unblocked paths.");

  const qaDependency = analysis.signals.find((signal) => signal.title === "QA dependency: build candidate is not frozen");
  assert.equal(qaDependency.recommendedAction, "Freeze the build candidate or assign a QA unblock owner before launch review.");
  assert.ok(!analysis.signals.some((signal) => signal.type === "blocker" && /QA cannot start/i.test(signal.evidence[0].quote)));
});

test("classifies different project wording without demo-specific labels", () => {
  const workspace = {
    project: {
      name: "Atlas Launch",
      launchDate: "2026-07-05",
      today: "2026-06-30",
      channel: "#signalroom-random-test",
      owner: "Romil Patel"
    },
    messages: [
      {
        id: "r1",
        ts: "2026-06-30T23:06:00+05:30",
        author: "Romil Patel",
        channel: "#signalroom-random-test",
        text: "Decision: we are targeting Monday release, but only if onboarding, database migration, and legal review are ready.",
        permalink: "slack://channel/signalroom-random-test/r1"
      },
      {
        id: "r2",
        ts: "2026-06-30T23:06:10+05:30",
        author: "Romil Patel",
        channel: "#signalroom-random-test",
        text: "The database migration keeps failing on the staging copy. I am not comfortable approving production until rollback is tested.",
        permalink: "slack://channel/signalroom-random-test/r2"
      },
      {
        id: "r3",
        ts: "2026-06-30T23:07:00+05:30",
        author: "Romil Patel",
        channel: "#signalroom-random-test",
        text: "Onboarding screens cannot be finished because the design tokens changed and frontend is waiting on the final UI package.",
        permalink: "slack://channel/signalroom-random-test/r3"
      },
      {
        id: "r4",
        ts: "2026-06-30T23:07:10+05:30",
        author: "Romil Patel",
        channel: "#signalroom-random-test",
        text: "Legal review still needs final approval and nobody knows who owns the signoff.",
        permalink: "slack://channel/signalroom-random-test/r4"
      },
      {
        id: "r5",
        ts: "2026-06-30T23:07:20+05:30",
        author: "Romil Patel",
        channel: "#signalroom-random-test",
        text: "I am covering migration cleanup, onboarding fixes, release notes, smoke testing, and support handoff today. I need backup.",
        permalink: "slack://channel/signalroom-random-test/r5"
      },
      {
        id: "r6",
        ts: "2026-06-30T23:07:30+05:30",
        author: "Romil Patel",
        channel: "#signalroom-random-test",
        text: "Customer support docs are still TBD. Someone needs to confirm the escalation owner before launch.",
        permalink: "slack://channel/signalroom-random-test/r6"
      },
      {
        id: "r7",
        ts: "2026-06-30T23:07:40+05:30",
        author: "Romil Patel",
        channel: "#signalroom-random-test",
        text: "The analytics dashboard is delayed because the warehouse refresh job is unstable.",
        permalink: "slack://channel/signalroom-random-test/r7"
      },
      {
        id: "r8",
        ts: "2026-06-30T23:07:50+05:30",
        author: "Romil Patel",
        channel: "#signalroom-random-test",
        text: "QA cannot start regression until the staging environment stops resetting during test runs.",
        permalink: "slack://channel/signalroom-random-test/r8"
      }
    ],
    issues: [],
    docs: [],
    calendar: []
  };

  const analysis = analyzeLaunchReadiness(workspace);
  const titles = analysis.signals.map((signal) => signal.title);

  assert.equal(analysis.messageCount, 8);
  assert.ok(titles.includes("Missing owner: legal review final approval"));
  assert.ok(titles.some((title) => /database migration|staging copy|analytics dashboard/i.test(title)));
  assert.ok(analysis.signals.some((signal) => signal.type === "owner_overload"));
  assert.ok(!titles.some((title) => /payment webhook|pricing final signoff|API contract blocks checkout/i.test(title)));

  const legal = analysis.signals.find((signal) => signal.title === "Missing owner: legal review final approval");
  assert.equal(legal.recommendedAction, "Name one legal review owner and set a signoff deadline today.");

  const onboarding = analysis.signals.find((signal) =>
    signal.type === "dependency" && /onboarding|design tokens|UI package/i.test(signal.evidence[0].quote)
  );
  assert.equal(onboarding.recommendedAction, "Freeze the final UI package or split onboarding work into blocked and unblocked paths.");
});

test("deduplicates the same risk across Slack and MCP evidence", () => {
  const workspace = {
    project: {
      name: "Atlas Launch",
      launchDate: "2026-07-05",
      today: "2026-06-30",
      channel: "#new-plan",
      owner: "Romil Patel"
    },
    messages: [
      {
        id: "m1",
        ts: "2026-06-30T16:45:00+05:30",
        author: "Romil Patel",
        channel: "#new-plan",
        text: "Security review needs final approval and no owner is assigned yet. The team still needs signoff before release notes and customer comms can be finalized.",
        permalink: "slack://channel/new-plan/m1"
      },
      {
        id: "m2",
        ts: "2026-06-30T17:06:00+05:30",
        author: "Linear MCP",
        channel: "linear/project-risk",
        text: "Security review needs final approval and no owner is assigned.",
        permalink: "linear://project-risk/m2"
      },
      {
        id: "m3",
        ts: "2026-06-30T17:07:00+05:30",
        author: "Romil Patel",
        channel: "#new-plan",
        text: "Customer comms are waiting on security approval and final release scope. Nobody has confirmed who owns the final signoff for the announcement.",
        permalink: "slack://channel/new-plan/m3"
      },
      {
        id: "m4",
        ts: "2026-06-30T17:08:00+05:30",
        author: "Romil Patel",
        channel: "#new-plan",
        text: "Blocker: deployment waits on infra approval and rollback proof is not ready. Staging deploy is unstable and the release owner does not want to promote without recovery proof.",
        permalink: "slack://channel/new-plan/m4"
      },
      {
        id: "m5",
        ts: "2026-06-30T17:09:00+05:30",
        author: "GitHub MCP",
        channel: "github/issues",
        text: "Blocker: deployment waits on infra approval and rollback proof is not ready.",
        permalink: "github://issues/m5"
      }
    ],
    issues: [],
    docs: [],
    calendar: []
  };

  const analysis = analyzeLaunchReadiness(workspace);
  const securityRisks = analysis.signals.filter((signal) => signal.title === "Missing owner: security review final approval");

  assert.equal(securityRisks.length, 1);
  assert.equal(securityRisks[0].severityLabel, "Critical");
  assert.equal(securityRisks[0].owner, "Missing");
  assert.equal(securityRisks[0].evidence.length, 2);
  assert.ok(securityRisks[0].evidence.some((item) => item.sender === "Romil Patel"));
  assert.ok(securityRisks[0].evidence.some((item) => item.sender === "Linear MCP"));

  const deploymentRisks = analysis.signals.filter((signal) =>
    signal.title === "Blocker: deployment waits on infra approval and rollback proof is not ready"
  );
  assert.equal(deploymentRisks.length, 1);
  assert.equal(deploymentRisks[0].evidence.length, 2);
  assert.ok(deploymentRisks[0].evidence.some((item) => item.sender === "Romil Patel"));
  assert.ok(deploymentRisks[0].evidence.some((item) => item.sender === "GitHub MCP"));
});

test("classifies locked release date as schedule risk instead of blocker", () => {
  const workspace = {
    project: {
      name: "Nova Launch",
      launchDate: "2026-07-03",
      today: "2026-06-30",
      channel: "#proj-nova",
      owner: "Mina"
    },
    messages: [
      {
        id: "l1",
        ts: "2026-06-30T10:00:00+05:30",
        author: "Mina",
        channel: "#proj-nova",
        text: "Decision: release date is locked for Friday, but QA approval is not ready.",
        permalink: "slack://channel/proj-nova/l1"
      },
      {
        id: "l2",
        ts: "2026-06-30T10:05:00+05:30",
        author: "Jo",
        channel: "#proj-nova",
        text: "Security review needs final approval and no owner is assigned yet.",
        permalink: "slack://channel/proj-nova/l2"
      }
    ],
    issues: [],
    docs: [],
    calendar: []
  };

  const analysis = analyzeLaunchReadiness(workspace);

  assert.ok(analysis.signals.some((signal) => signal.type === "decision_conflict" || signal.type === "launch_date"));
  assert.ok(!analysis.signals.some((signal) => signal.type === "blocker" && /release date is locked/i.test(signal.evidence[0].quote)));
  assert.ok(analysis.signals.some((signal) => signal.title === "Missing owner: security review final approval"));
});

test("ignores previous SignalRoom bot output when building what-if evidence", () => {
  const workspace = {
    project: {
      name: "Atlas Launch",
      launchDate: "2026-07-05",
      today: "2026-06-30",
      channel: "#signalroom-demo",
      owner: "Romil Patel"
    },
    messages: [
      {
        id: "p1",
        ts: "2026-06-30T09:39:00+05:30",
        author: "Romil Patel",
        channel: "#signalroom-demo",
        text: "Decision: we are keeping the public launch date at Friday unless payment or QA changes.",
        permalink: "slack://channel/signalroom-demo/p1"
      },
      {
        id: "p2",
        ts: "2026-06-30T09:40:00+05:30",
        author: "Romil Patel",
        channel: "#signalroom-demo",
        text: "Blocker: payment webhook retries are still failing in staging. I can keep digging after auth QA.",
        permalink: "slack://channel/signalroom-demo/p2"
      },
      {
        id: "p3",
        ts: "2026-06-30T14:08:00+05:30",
        author: "SignalRoom",
        channel: "#signalroom-demo",
        text: ":test_tube: SignalRoom What-if Simulation\nScenario: deployment slips 2 days\nDeployment remains blocked on infra approval.\nRollback proof stays incomplete.",
        permalink: "slack://channel/signalroom-demo/p3"
      }
    ],
    issues: [],
    docs: [],
    calendar: []
  };

  const deployment = buildWhatIfSimulation(workspace, "deployment slips 2 days");
  const payment = buildWhatIfSimulation(workspace, "payment slips 2 days");

  assert.equal(deployment.confidence, "Low");
  assert.ok(deployment.affectedDependencies.some((item) => /No direct evidence found for deployment/i.test(item)));
  assert.equal(payment.confidence, "High");
});
