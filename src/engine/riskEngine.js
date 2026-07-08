const DAY_MS = 24 * 60 * 60 * 1000;
const BLOCKER_PATTERN = /\b(blocker|blocked|blocking|failing|failure|broken|cannot start|can't start|delayed|delay|stuck|not ready|unstable)\b/i;
const HARD_BLOCKER_PATTERN = /\b(blocker|blocked|blocking|failing|failure|broken|stuck|unstable)\b/i;
const MISSING_OWNER_PATTERN = /\b(no owner|who owns|do not know who owns|don't know who owns|tbd|someone needs to|needs final approval|needs approval|final signoff|unowned)\b/i;
const OWNER_OVERLOAD_PATTERN = /\b(backup would help|need backup|needs backup|need help|too much on my plate|too much|overloaded|over capacity|swamped|spread too thin)\b/i;
const DEPENDENCY_PATTERN = /\b(waits on|waiting on|blocked by|depends on|dependent on|cannot start(?: .+)? until|can't start(?: .+)? until|needs .+ before|until .+ ready|after .+|handoff|launch waits on|frontend waits on|deployment waits on|qa waits on)\b/i;
const DECISION_PATTERN = /\b(decision:|launch date|release date|ship date|go-live|go live|fixed|locked|still planned|keeping .+ date|committed to|target date)\b/i;
const UNRESOLVED_PATTERN = /\b(unresolved|pending|not ready|blocked|blocking|failing|broken|cannot start|can't start|waiting|waits|depends|needs|tbd|no owner|who owns|approval|signoff|delayed|stuck|unstable)\b/i;

export function analyzeLaunchReadiness(workspace) {
  const project = workspace.project;
  const today = new Date(project.today);
  const launchDate = new Date(project.launchDate);
  const daysToLaunch = Math.max(0, Math.ceil((launchDate - today) / DAY_MS));
  const signals = dedupeSignals([
    ...detectBlockers(workspace),
    ...detectQaDependencyRisk(workspace),
    ...detectMissingOwners(workspace),
    ...detectOwnerOverload(workspace),
    ...detectDecisionConflicts(workspace),
    ...detectLaunchDateRisk(workspace, daysToLaunch)
  ]);
  const riskScore = calculateRiskScore(signals, daysToLaunch);
  const readiness = Math.max(0, 100 - riskScore);

  return {
    project,
    daysToLaunch,
    riskScore,
    readiness,
    level: riskLevel(riskScore),
    messageCount: countProjectMessages(workspace.messages),
    summary: buildSummary(riskScore, readiness, daysToLaunch),
    scoreExplanation: explainScore(signals),
    signals,
    recommendedActions: recommendActions(signals),
    evidence: collectEvidence(signals)
  };
}

export function buildDecisionTimeline(workspace) {
  const events = [];

  for (const message of workspace.messages) {
    const text = message.text;
    if (/decision:|keeping the public launch date|do not launch unless/i.test(text)) {
      events.push(timelineEvent(message, "Decision", normalizeDecision(text)));
    } else if (BLOCKER_PATTERN.test(text)) {
      events.push(timelineEvent(message, "Blocker", summarizeText(text)));
    } else if (DEPENDENCY_PATTERN.test(text)) {
      events.push(timelineEvent(message, dependencyEventType(text), summarizeText(text)));
    } else if (MISSING_OWNER_PATTERN.test(text)) {
      events.push(timelineEvent(message, "Missing approval", summarizeText(text)));
    } else if (/I own|I'm handling|I am handling|handling|owner/i.test(text) || OWNER_OVERLOAD_PATTERN.test(text)) {
      events.push(timelineEvent(message, "Ownership change", summarizeText(text)));
    }
  }

  return dedupeTimeline(events)
    .sort((a, b) => new Date(a.time) - new Date(b.time));
}

export function buildWhatIfSimulation(workspace, scenario) {
  const baseline = analyzeLaunchReadiness(workspace);
  const scenarioSignal = buildScenarioSignal(workspace, scenario);
  const hasDirectEvidence = scenarioSignal?.directEvidenceFound;
  const scenarioSignals = hasDirectEvidence ? dedupeSignals([...baseline.signals, scenarioSignal]) : baseline.signals;
  const projectedRisk = hasDirectEvidence
    ? Math.min(95, calculateRiskScore(scenarioSignals, baseline.daysToLaunch) + 5)
    : Math.min(95, baseline.riskScore + 1);
  const projectedReadiness = Math.max(0, 100 - projectedRisk);

  return {
    scenario,
    currentReadiness: baseline.readiness,
    projectedReadiness,
    currentRisk: baseline.riskScore,
    projectedRisk,
    affectedDependencies: hasDirectEvidence
      ? affectedDependencies(scenarioSignal)
      : unsupportedTopicDependencies(scenarioSignal, baseline.signals),
    chainReaction: chainReactionForScenario(scenario, baseline.signals, scenarioSignal),
    bestRescueMove: bestRescueMove(scenarioSignal || baseline.signals[0], baseline.recommendedActions),
    confidence: scenarioSignal ? (hasDirectEvidence ? "High" : "Low") : "Medium",
    evidence: (scenarioSignal?.evidence || baseline.signals[0]?.evidence || []).slice(0, 3)
  };
}

export function buildRescueBrief(workspace) {
  const analysis = analyzeLaunchReadiness(workspace);

  return {
    title: `${workspace.project.name} rescue brief`,
    riskScore: analysis.riskScore,
    readiness: analysis.readiness,
    summary: analysis.summary,
    scoreExplanation: analysis.scoreExplanation,
    priorities: analysis.signals.slice(0, 3).map((signal) => ({
      risk: signal.title,
      owner: signal.owner || "Needs owner",
      action: actionForSignal(signal),
      expectedImpact: impactForSignal(signal),
      evidence: signal.evidence.slice(0, 1)
    })),
    nextMeeting: workspace.calendar.find((event) => /launch review/i.test(event.title))
  };
}

export function simulateScenario(workspace, scenario) {
  const signal = buildScenarioSignal(workspace, scenario);
  return signal ? [signal] : [];
}

function detectBlockers(workspace) {
  return workspace.messages
    .filter((message) => isStandaloneBlocker(message.text))
    .map((message) => ({
      type: "blocker",
      category: "Blockers",
      topic: topicFromText(message.text),
      severity: /critical|production|prod|launch|release|checkout|deploy|security|customer|failing|failure|broken|staging/i.test(message.text) ? 28 : 22,
      title: titleFromTopic("Blocker", message.text),
      detail: "A launch-critical item is explicitly blocked or failing.",
      impact: impactForCategory("blocker", message.text),
      owner: ownerForRisk(message.text, message.author),
      recommendedAction: actionForCategory("blocker", message.text),
      evidence: [citationFromMessage(message)]
    }));
}

function detectQaDependencyRisk(workspace) {
  return workspace.messages
    .filter((message) => DEPENDENCY_PATTERN.test(message.text) && !isStandaloneBlocker(message.text))
    .map((message) => ({
      type: "dependency",
      category: "QA/dependency risk",
      topic: `dependency-${topicFromText(message.text)}`,
      severity: 26,
      title: dependencyTitle(message.text),
      detail: "QA or validation work cannot start on time.",
      impact: impactForCategory("dependency", message.text),
      owner: null,
      recommendedAction: actionForCategory("dependency", message.text),
      evidence: [citationFromMessage(message)]
    }));
}

function detectMissingOwners(workspace) {
  return workspace.messages
    .filter((message) => MISSING_OWNER_PATTERN.test(message.text))
    .map((message) => ({
      type: "missing_owner",
      category: "Missing ownership",
      topic: `missing-owner-${topicFromText(message.text)}`,
      severity: /no owner|who owns|final signoff|final approval/i.test(message.text) ? 29 : 25,
      title: `Missing owner: ${ownershipTopic(message.text)}`,
      detail: "A required approval or signoff is unresolved and has no accountable owner.",
      impact: impactForCategory("missing_owner", message.text),
      owner: "Missing",
      recommendedAction: actionForCategory("missing_owner", message.text),
      evidence: [citationFromMessage(message)]
    }));
}

function detectOwnerOverload(workspace) {
  const signals = [];

  for (const message of workspace.messages) {
    const ownedTasks = extractOwnedTasks(message.text);
    const asksForBackup = OWNER_OVERLOAD_PATTERN.test(message.text);
    if (ownedTasks.length < 3 && !asksForBackup) continue;

    signals.push({
      type: "owner_overload",
      category: "Owner overload",
      topic: `owner-overload-${message.author}`,
      severity: Math.min(24 + ownedTasks.length * 2 + (asksForBackup ? 4 : 0), 32),
      title: `${message.author} is overloaded on launch-critical work`,
      detail: `${message.author} owns ${ownedTasks.length || "multiple"} launch-critical item${ownedTasks.length === 1 ? "" : "s"}${asksForBackup ? " and asked for backup" : ""}.`,
      impact: "A single overloaded owner creates a delivery and continuity risk.",
      owner: message.author,
      tasks: ownedTasks,
      taskCount: ownedTasks.length,
      reason: asksForBackup ? "Explicit backup request" : "3+ launch-critical owned tasks",
      recommendedAction: "Move at least one critical item to a backup owner today.",
      evidence: [citationFromMessage(message)]
    });
  }

  return signals;
}

function detectDecisionConflicts(workspace) {
  const launchCommitment = workspace.messages.find((message) => DECISION_PATTERN.test(message.text));
  const sameMessageConflict = launchCommitment && UNRESOLVED_PATTERN.test(launchCommitment.text);
  const qaConflict = workspace.messages.find((message) =>
    message !== launchCommitment && (DEPENDENCY_PATTERN.test(message.text) || BLOCKER_PATTERN.test(message.text) || MISSING_OWNER_PATTERN.test(message.text))
  );

  if (!launchCommitment || (!qaConflict && !sameMessageConflict)) return [];
  const conflictMessage = qaConflict || launchCommitment;

  return [
    {
      type: "decision_conflict",
      category: "Decision conflict",
      topic: `decision-conflict-${topicFromText(launchCommitment.text)}-${topicFromText(conflictMessage.text)}`,
      severity: 30,
      title: decisionConflictTitle(launchCommitment.text, conflictMessage.text),
      detail: "A launch or release decision conflicts with unresolved project work.",
      impact: impactForCategory("decision_conflict", conflictMessage.text),
      owner: workspace.project?.owner || launchCommitment.author,
      recommendedAction: actionForCategory("decision_conflict", conflictMessage.text),
      evidence: bestEvidence([citationFromMessage(launchCommitment), citationFromMessage(conflictMessage)])
    }
  ];
}

function detectLaunchDateRisk(workspace, daysToLaunch) {
  const launchMessage = workspace.messages.find((message) => DECISION_PATTERN.test(message.text) || /\b(launch|release|ship|go-live)\b/i.test(message.text));
  if (!launchMessage || daysToLaunch > 7) return [];
  if (workspace.messages.some((message) => DEPENDENCY_PATTERN.test(message.text))) return [];

  const unresolvedTopics = workspace.messages
    .filter((message) => message !== launchMessage && UNRESOLVED_PATTERN.test(message.text))
    .map((message) => readableTopic(message.text));
  const uniqueTopics = [...new Set(unresolvedTopics)].slice(0, 4);

  if (uniqueTopics.length < 2) return [];

  return [
    {
      type: "launch_date",
      category: "Launch-date risk",
      topic: "fixed-launch-with-unresolved-work",
      severity: Math.min(22 + uniqueTopics.length * 2, 30),
      title: "Fixed launch date has unresolved dependencies",
      detail: `Launch is ${daysToLaunch} days away while ${uniqueTopics.join(", ")} remain unresolved.`,
      impact: "The team has little buffer left for fixes, QA, and approval loops.",
      owner: workspace.project?.owner || launchMessage.author,
      recommendedAction: "Run a launch rescue review and either reduce scope or move the date.",
      evidence: [citationFromMessage(launchMessage)]
    }
  ];
}

function buildScenarioSignal(workspace, scenario) {
  const normalized = scenario.toLowerCase();
  const intent = parseScenarioIntent(scenario);
  const topic = intent.topic || scenarioTopic(scenario, "");
  const directEvidence = prioritizedTopicEvidence(workspace, topic, [
    ...scenarioRiskPatterns(normalized),
    ...topicEvidencePatterns(topic),
    ...scenarioKeywordPatterns(normalized)
  ]);
  const directEvidenceFound = directEvidence.length > 0;
  const fallbackEvidence = directEvidenceFound ? [] : prioritizedScenarioEvidence(workspace, [
    BLOCKER_PATTERN,
    DEPENDENCY_PATTERN,
    MISSING_OWNER_PATTERN,
    OWNER_OVERLOAD_PATTERN,
    DECISION_PATTERN
  ]);
  const evidence = bestEvidence([...directEvidence, ...fallbackEvidence]);

  if (evidence.length && /\b(slips?|delay|late|blocked|fails?|breaks?|moves?|miss|risk|what if)\b/.test(normalized)) {
    return {
      type: "scenario",
      category: "What-if impact",
      topic: `scenario-${normalizeTopic(topic)}`,
      scenarioTopic: topic,
      directEvidenceFound,
      delayDays: intent.delayDays,
      severity: 30,
      title: `${capitalize(topic)} delay threatens project dependencies`,
      detail: directEvidenceFound
        ? `A ${topic} slip compresses validation, ownership, and launch approval.`
        : `No direct evidence found for ${topic}; simulation is low confidence.`,
      impact: `${capitalize(topic)} uncertainty can reduce launch readiness and force late tradeoffs.`,
      owner: evidence[0].sender,
      recommendedAction: topicSpecificRescueMove(topic, directEvidenceFound),
      evidence
    };
  }

  return null;
}

function dedupeSignals(signals) {
  const byTopic = new Map();

  for (const signal of signals.filter((item) => item.evidence?.length)) {
    const key = dedupeKeyForSignal(signal);
    const current = byTopic.get(key);
    if (!current || signal.severity > current.severity) {
      byTopic.set(key, {
        ...signal,
        topic: key,
        severityLabel: severityLabel(signal.severity),
        confidence: confidenceLabel(signal),
        evidence: bestEvidence([...(current?.evidence || []), ...signal.evidence])
      });
    } else {
      current.evidence = bestEvidence([...current.evidence, ...signal.evidence]);
      current.confidence = confidenceLabel(current);
    }
  }

  return sortSignals([...byTopic.values()]).slice(0, 8);
}

function dedupeKeyForSignal(signal) {
  const subject = canonicalRiskSubject(signal);
  return `${signal.type}|${subject}`;
}

function canonicalRiskSubject(signal) {
  const title = signal.title || "";
  const text = [
    signal.title,
    signal.topic,
    ...(signal.evidence || []).map((item) => item.quote)
  ].join(" ");

  if (signal.type === "missing_owner") {
    if (/customer comms|announcement/i.test(title) && /final signoff|final approval|who owns|no owner/i.test(title)) {
      return "customer-comms-final-signoff";
    }
    if (/security review|security approval/i.test(title) && /final approval|approval|signoff|no owner|who owns/i.test(title)) {
      return "security-review-final-approval";
    }
    if (/pricing/i.test(title) && /final approval|final signoff|approval|who owns|no owner/i.test(title)) {
      return "pricing-final-approval";
    }
    if (/customer comms|announcement/i.test(text) && /final signoff|final approval|who owns|no owner/i.test(text)) {
      return "customer-comms-final-signoff";
    }
    if (/security review|security approval/i.test(text) && /final approval|approval|signoff|no owner|who owns/i.test(text)) {
      return "security-review-final-approval";
    }
    if (/pricing/i.test(text) && /final approval|final signoff|approval|who owns|no owner/i.test(text)) {
      return "pricing-final-approval";
    }
  }

  if (signal.type === "blocker" && /deploy|deployment|infra|rollback|staging/i.test(text)) {
    return "deployment-infra-rollback";
  }

  if (signal.type === "dependency" && /api contract|checkout screens|frontend/i.test(text)) {
    return "api-contract-checkout";
  }

  return normalizeRiskText(signal.topic || signal.title);
}

function bestEvidence(evidence) {
  const seen = new Set();
  const unique = [];

  for (const item of evidence) {
    const key = `${item.sender}|${normalizeRiskText(item.quote)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return unique.slice(0, 2);
}

function calculateRiskScore(signals, daysToLaunch) {
  const categoryWeight = signals.reduce((total, signal) => total + signal.severity, 0);
  const categoryBreadth = new Set(signals.map((signal) => signal.type)).size;
  const urgency = daysToLaunch <= 5 ? 8 : daysToLaunch <= 10 ? 4 : 0;
  const breadthBoost = Math.min(categoryBreadth * 2.5, 14);
  return Math.min(92, Math.round(categoryWeight * 0.5 + urgency + breadthBoost));
}

function riskLevel(score) {
  if (score >= 75) return "critical";
  if (score >= 55) return "high";
  if (score >= 35) return "medium";
  return "low";
}

function buildSummary(riskScore, readiness, daysToLaunch) {
  if (riskScore >= 75) {
    return `Launch readiness is ${readiness}% with ${daysToLaunch} days left. SignalRoom recommends a rescue review today.`;
  }
  if (riskScore >= 55) {
    return `Launch readiness is ${readiness}% with material risks that need owners within 24 hours.`;
  }
  return `Launch readiness is ${readiness}%. Keep watching unresolved work and owner load.`;
}

function explainScore(signals) {
  const categories = signals.slice(0, 5).map((signal) => signal.category.toLowerCase());
  if (categories.length === 0) {
    return "Risk is low because SignalRoom did not find evidence-backed launch risks in Slack.";
  }
  const hasFridayConflict = signals.some((signal) => signal.type === "decision_conflict");
  const hasPayment = signals.some((signal) => /payment|webhook/i.test(signal.title));
  const hasQa = signals.some((signal) => signal.type === "dependency" && /qa/i.test(signal.title));
  const hasApproval = signals.some((signal) => signal.type === "missing_owner");
  const hasCapacity = signals.some((signal) => signal.type === "owner_overload");
  if (hasFridayConflict && hasPayment && hasQa && hasApproval && hasCapacity) {
    return "Launch is still planned for Friday, but payment, QA, approval ownership, and owner capacity are unresolved.";
  }
  return `Risk is high because ${sentenceList([...new Set(categories)])} are unresolved in Slack evidence.`;
}

function recommendActions(signals) {
  const actions = signals.slice(0, 4).map((signal) => signal.recommendedAction);
  actions.push("Post a rescue brief to the launch channel and pin it until launch.");
  return [...new Set(actions)];
}

function collectEvidence(signals) {
  return bestEvidence(signals.flatMap((signal) => signal.evidence || []));
}

function countEvidenceMessages(signals) {
  const messageKeys = new Set();

  for (const signal of signals) {
    for (const evidence of signal.evidence || []) {
      messageKeys.add(`${evidence.channel}|${evidence.sender}|${evidence.timestamp}|${evidence.quote}`);
    }
  }

  return messageKeys.size;
}

function countProjectMessages(messages = []) {
  const seen = new Set();

  for (const message of messages) {
    if (!isProjectMessage(message)) continue;
    seen.add(normalizeMessageText(message.text));
  }

  return seen.size;
}

function isProjectMessage(message) {
  const text = (message?.text || "").trim();
  if (!text) return false;
  if (/^\/signalroom\b/i.test(text)) return false;
  if (/joined #|was added to #|cleaned \d+ signalroom messages/i.test(text)) return false;
  if (/signalroom/i.test(message.author || "")) return false;
  return true;
}

function normalizeMessageText(text) {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s:/.-]/g, "")
    .trim();
}

function actionForSignal(signal) {
  return signal.recommendedAction || "Assign an owner and confirm the next action in Slack.";
}

function impactForSignal(signal) {
  return signal.impact || "Reduces launch uncertainty and gives the team a clear next move.";
}

function affectedDependencies(signal) {
  if (!signal) return [];
  const topic = signal.scenarioTopic || "";
  if (/deploy|deployment|staging|infra|rollback/i.test(topic)) {
    return ["staging deploy", "infra approval", "rollback proof", "release readiness"];
  }
  if (/payment|webhook|checkout/i.test(topic)) return ["payment webhook", "checkout validation", "QA signoff"];
  if (/qa|test|validation|build/i.test(topic)) return ["build readiness", "QA pass", "launch approval"];
  if (/approval|pricing|signoff|legal|finance|security/i.test(topic)) return ["approval owner", "launch docs", "final approval"];
  if (/frontend|api/i.test(topic)) return ["API contract", "frontend integration", "release validation"];

  const text = `${signal.title} ${signal.detail || ""} ${(signal.evidence || []).map((item) => item.quote).join(" ")}`;
  if (/deploy|deployment|staging|infra|rollback|environment/i.test(text)) return ["staging deploy", "infra approval", "rollback proof", "release readiness"];
  if (/payment|webhook|checkout/i.test(text)) return ["payment webhook", "checkout validation", "QA signoff"];
  if (/QA|test|validation|build/i.test(text)) return ["build readiness", "QA pass", "launch approval"];
  if (/approval|pricing|signoff|legal|finance/i.test(text)) return ["approval owner", "launch docs", "final approval"];
  if (/frontend|api/i.test(text)) return ["API contract", "frontend integration", "release validation"];
  return ["owner capacity", "launch checklist", "decision review"];
}

function unsupportedTopicDependencies(scenarioSignal, signals) {
  const topic = scenarioSignal?.scenarioTopic || "scenario";
  const relatedRisks = signals
    .slice(0, 4)
    .map((signal) => readableRelatedRisk(signal))
    .filter(Boolean);

  return dedupeByNormalizedText([
    `No direct evidence found for ${topic} in recent Slack or MCP context.`,
    ...relatedRisks
  ]).slice(0, 4);
}

function readableRelatedRisk(signal) {
  const text = `${signal.title} ${(signal.evidence || []).map((item) => item.quote).join(" ")}`;
  if (/api contract|frontend/i.test(text)) return "API contract is blocking checkout screens";
  if (/deploy|deployment|infra|rollback/i.test(text)) return "Deployment waits on infra approval or rollback proof";
  if (/security.*approval|approval.*security/i.test(text)) return "Security review approval has no owner";
  if (/approval|signoff|owner/i.test(text)) return "Approval or signoff work needs an owner";
  if (/qa|test|validation|build/i.test(text)) return "QA or build validation is still at risk";
  if (/overload|backup|too much/i.test(text)) return "Owner capacity is still constrained";
  return summarizeText(signal.title).replace(/^(Blocker|Decision conflict|Missing owner):\s*/i, "");
}

function dedupeByNormalizedText(items) {
  const seen = new Set();
  const unique = [];

  for (const item of items) {
    const key = item
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return unique;
}

function chainReactionForScenario(scenario, signals, scenarioSignal) {
  const normalized = scenario.toLowerCase();
  const topic = scenarioSignal?.scenarioTopic || parseScenarioIntent(scenario).topic;
  if (scenarioSignal && !scenarioSignal.directEvidenceFound) {
    return [
      `No direct evidence found for ${topic}; simulation is low confidence.`,
      "SignalRoom is using general launch risks instead.",
      "Validate the scenario in-channel before making a launch decision."
    ];
  }

  if (/deploy|deployment|staging|infra|rollback/.test(topic) || /deploy|deployment|staging|infra|rollback/.test(normalized)) {
    return [
      "Deployment remains blocked on infra approval.",
      "Rollback proof stays incomplete.",
      "Release readiness drops because production recovery is unproven.",
      "Launch becomes unsafe unless scope is reduced or deployment is delayed."
    ];
  }

  if (/payment|webhook|checkout/.test(normalized)) {
    return [
      "Payment fix slips.",
      "Checkout validation loses its buffer.",
      "QA signoff moves closer to launch.",
      "Launch review must choose between delay, scope cut, or higher risk."
    ];
  }

  if (/approval|pricing|signoff/.test(normalized)) {
    return [
      "Final approval stays unresolved.",
      "Pricing copy and screenshots remain unstable.",
      "Docs and launch comms cannot be finalized.",
      "Launch review needs an owner and decision deadline."
    ];
  }

  return signals.slice(0, 4).map((signal) => signal.impact);
}

function bestRescueMove(signal, recommendedActions) {
  return signal?.recommendedAction || recommendedActions[0] || "Run a launch rescue review today.";
}

function timelineEvent(message, type, summary) {
  return {
    time: message.ts,
    type,
    summary,
    evidence: citationFromMessage(message)
  };
}

function dedupeTimeline(events) {
  const seen = new Set();
  return events.filter((event) => {
    const key = `${event.type}|${event.summary.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractOwnedTasks(text) {
  const match = text.match(/(?:I own|I'm handling|I am handling|handling|on my plate:?)(.+?)(?: today| right now|\.|$)/i);
  if (!match) return [];
  return match[1]
    .replace(/\b(backup would help|need backup|needs backup|too much on my plate)\b/gi, "")
    .split(/,| and | & |\+/i)
    .map((task) => task.trim())
    .filter((task) => task && !/^(too much|many tasks)$/i.test(task));
}

function findSlackEvidence(workspace, pattern) {
  const message = workspace.messages.find((item) => pattern.test(item.text));
  return message ? citationFromMessage(message) : null;
}

function findMessageOwner(workspace, pattern) {
  return workspace.messages.find((item) => pattern.test(item.text))?.author || null;
}

function sortSignals(signals) {
  return [...signals].sort((a, b) => {
    const severityDelta = b.severity - a.severity;
    if (severityDelta !== 0) return severityDelta;
    return rankingPriority(a) - rankingPriority(b);
  });
}

function rankingPriority(signal) {
  const priorities = {
    owner_overload: 1,
    decision_conflict: 2,
    missing_owner: 3,
    blocker: 4,
    dependency: 5,
    launch_date: 6
  };
  return priorities[signal.type] || 10;
}

function severityLabel(score) {
  if (score >= 27) return "Critical";
  if (score >= 21) return "High";
  if (score >= 14) return "Medium";
  return "Low";
}

function confidenceLabel(signal) {
  if ((signal.evidence?.length || 0) >= 2 || signal.reason === "Explicit backup request") return "High";
  if ((signal.evidence?.length || 0) === 1) return "High";
  return "Medium";
}

function prioritizedScenarioEvidence(workspace, patterns) {
  const evidence = [];
  const seen = new Set();

  for (const pattern of patterns) {
    const message = workspace.messages.find((item) => pattern.test(item.text));
    if (!message) continue;
    const citation = citationFromMessage(message);
    const key = `${citation.sender}|${citation.timestamp}|${citation.quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    evidence.push(citation);
    if (evidence.length >= 3) break;
  }

  return evidence;
}

function prioritizedTopicEvidence(workspace, topic, patterns) {
  const matches = [];
  const seen = new Set();

  for (const message of workspace.messages) {
    if (!patterns.some((pattern) => pattern.test(message.text))) continue;
    const citation = citationFromMessage(message);
    const key = `${citation.sender}|${citation.timestamp}|${citation.quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({
      citation,
      score: topicEvidenceScore(message.text, topic)
    });
  }

  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.citation);
}

function topicEvidenceScore(text, topic) {
  let score = 0;
  const normalizedTopic = normalizeTopic(topic);
  if (normalizedTopic && new RegExp(escapeRegExp(normalizedTopic).replace(/-/g, ".{0,12}"), "i").test(text)) score += 5;
  if (/\b(blocker|blocked|blocking|failing|failure|broken|cannot start|can't start|delayed|delay|stuck|not ready|unstable|waits on|waiting on|depends on)\b/i.test(text)) score += 4;
  if (/deploy|deployment|staging|infra|rollback/i.test(topic) && /deploy|deployment|staging|infra|rollback/i.test(text)) score += 4;
  if (/deploy|deployment|staging|infra|rollback/i.test(topic) && /\b(infra|infrastructure|rollback|staging)\b/i.test(text)) score += 5;
  if (/deploy|deployment|staging|infra|rollback/i.test(topic) && /\b(blocker|blocked|waits on|waiting on|not ready|proof)\b/i.test(text)) score += 4;
  if (/payment|webhook|checkout/i.test(topic) && /\b(payment|payment webhook|billing|invoice|checkout payment|payment qa|transaction|refund)\b/i.test(text)) score += 4;
  if (/approval|signoff|owner|tbd|no owner/i.test(text)) score += 2;
  if (/launch|release|ship|go-live|thursday|friday/i.test(text)) score += 1;
  if (DECISION_PATTERN.test(text)) score -= 2;
  return score;
}

function parseScenarioIntent(scenario) {
  const cleaned = scenario
    .replace(/^\/?signalroom\s+/i, "")
    .replace(/^what\s*if\s+/i, "")
    .replace(/^whatif\s+/i, "")
    .trim();
  const delayMatch = cleaned.match(/\b(slips?|delays?|delayed|late|moves?|miss(?:es)?)\s+(\d+)\s+days?\b/i);
  const topicPart = delayMatch ? cleaned.slice(0, delayMatch.index).trim() : cleaned;
  const topic = topicPart
    .replace(/\b(if|what|risk|scenario|the|a|an)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return {
    topic: topic || "scenario",
    delayDays: delayMatch ? Number.parseInt(delayMatch[2], 10) : null
  };
}

function topicEvidencePatterns(topic) {
  if (/deploy|deployment|staging|infra|rollback/i.test(topic)) {
    return [
      /\b(deploy|deployment|staging|infra|infrastructure|rollback|release)\b/i,
      /(?=.*\b(deploy|deployment|staging|infra|rollback)\b)(?=.*\b(blocked|waits on|waiting on|not ready|approval|proof|delayed|stuck)\b)/i
    ];
  }

  if (/payment|webhook|checkout/i.test(topic)) {
    return [
      /\b(payment|payment webhook|billing|invoice|checkout payment|payment qa|transaction|refund)\b/i,
      /(?=.*\b(payment|payment webhook|billing|invoice|checkout payment|payment qa|transaction|refund)\b)(?=.*\b(blocked|failing|failure|broken|not ready|delayed|stuck)\b)/i
    ];
  }

  if (/qa|test|validation|build/i.test(topic)) {
    return [
      /\b(qa|test|testing|validation|build|candidate)\b/i,
      /(?=.*\b(qa|test|validation|build)\b)(?=.*\b(cannot start|blocked|waiting|not ready|delayed)\b)/i
    ];
  }

  if (/approval|pricing|signoff|legal|finance|security/i.test(topic)) {
    return [
      /\b(approval|pricing|signoff|legal|finance|security|owner)\b/i,
      /(?=.*\b(approval|signoff|security|pricing)\b)(?=.*\b(no owner|who owns|tbd|needs|pending)\b)/i
    ];
  }

  return [new RegExp(escapeRegExp(topic), "i")];
}

function topicSpecificRescueMove(topic, directEvidenceFound = true) {
  if (!directEvidenceFound) {
    return `Confirm whether ${topic} is in launch scope. If yes, assign an owner and post ${topic} test evidence before launch review.`;
  }
  if (/deploy|deployment|staging|infra|rollback/i.test(topic)) {
    return "Assign an infra approval owner and require rollback proof before the next launch review.";
  }
  if (/payment|webhook|checkout/i.test(topic)) {
    return "Put a backup owner on payment and require checkout proof before launch review.";
  }
  if (/qa|test|validation|build/i.test(topic)) {
    return "Freeze the build candidate or split QA into blocked and unblocked tracks.";
  }
  if (/approval|pricing|signoff|legal|finance|security/i.test(topic)) {
    return "Name one approval owner and set a decision deadline today.";
  }
  return `Assign a backup owner for ${topic} and require proof before the next launch review.`;
}

function isStandaloneBlocker(text) {
  if (!BLOCKER_PATTERN.test(text)) return false;
  if (isLockedDateDecision(text)) return false;
  if (/\bqa\b.*\bcannot start\b.*\buntil\b/i.test(text)) return false;
  if (/\bcannot start\b.*\buntil\b/i.test(text) && /build|candidate|qa|test|validation|regression/i.test(text)) return false;
  if (!DEPENDENCY_PATTERN.test(text)) return true;
  return HARD_BLOCKER_PATTERN.test(text);
}

function isLockedDateDecision(text) {
  return DECISION_PATTERN.test(text)
    && /\b(launch|release|ship|go-live|go live|date|thursday|friday|monday|tuesday|wednesday)\b/i.test(text)
    && UNRESOLVED_PATTERN.test(text);
}

function dependencyEventType(text) {
  if (/qa|test|validation/i.test(text)) return "QA dependency";
  if (/approval|signoff|legal|finance/i.test(text)) return "Approval dependency";
  if (/frontend|api/i.test(text)) return "Frontend/API dependency";
  if (/deploy|infra|environment/i.test(text)) return "Deployment dependency";
  return "Dependency";
}

function dependencyTitle(text) {
  if (/onboarding|design tokens|ui package/i.test(text)) {
    return "QA dependency: onboarding waits on final UI package";
  }
  if (/api contract|checkout screens|frontend/i.test(text)) {
    return "QA dependency: API contract blocks checkout completion";
  }
  if (/qa.*cannot start|full regression|build candidate/i.test(text)) {
    return "QA dependency: build candidate is not frozen";
  }
  if (/customer comms|release notes|announcement/i.test(text) && /security approval|signoff|scope/i.test(text)) {
    return "Approval dependency: customer comms wait on security signoff";
  }
  const prefix = dependencyEventType(text).replace("Frontend/API", "Frontend/API").replace("Deployment", "Deployment");
  return `${prefix}: ${readableTopic(text)}`;
}

function decisionConflictTitle(commitmentText, conflictText) {
  if (/release date is locked|locked for thursday|thursday/i.test(commitmentText) && /api contract|checkout screens|frontend/i.test(conflictText)) {
    return "Decision conflict: Thursday release is locked while API contract blocks checkout completion";
  }
  if (/release date is locked|locked for thursday|thursday/i.test(commitmentText) && /deploy|deployment|infra|rollback/i.test(conflictText)) {
    return "Decision conflict: Thursday release is locked while deployment approval is unresolved";
  }
  if (/release date is locked|locked for thursday|thursday/i.test(commitmentText) && /security|approval|signoff/i.test(conflictText)) {
    return "Decision conflict: Thursday release is locked while security approval is unresolved";
  }
  const commitment = /launch|release|ship|go-live/i.test(commitmentText) ? "launch plan" : readableTopic(commitmentText);
  return `Decision conflict: ${commitment} conflicts with ${readableTopic(conflictText)}`;
}

function ownershipTopic(text) {
  const item = explicitOwnershipItem(text);
  if (item) return item;

  const cleaned = stripLeadIn(text).split(/[.!?]/)[0]
    .replace(/\b(I do not know who owns|I don't know who owns|who owns|no owner|TBD|someone needs to|needs final approval|needs approval|final signoff|unowned)\b/gi, "")
    .replace(/\b(still|the|a|an|is|are|it|this|that|assigned|yet)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? summarizeText(cleaned).slice(0, 72).toLowerCase() : "unassigned work";
}

function explicitOwnershipItem(text) {
  const firstSentence = stripLeadIn(text).split(/[.!?]/)[0];
  const approvalMatch = firstSentence.match(/\b(.+?)\s+needs\s+(final\s+approval|approval|final\s+signoff|signoff)\b/i);
  if (approvalMatch) {
    return cleanOwnershipItem(`${approvalMatch[1]} ${approvalMatch[2]}`);
  }

  if (/customer comms/i.test(text) && /who owns|final signoff|final approval/i.test(text)) {
    return "customer comms final signoff";
  }

  const noOwnerMatch = firstSentence.match(/\b(?:no owner(?:\s+is\s+assigned)?\s+(?:for\s+)?|who owns\s+|I do not know who owns\s+|I don't know who owns\s+)(.+?)\b(?:yet|today|right now)?$/i);
  if (noOwnerMatch) {
    return cleanOwnershipItem(noOwnerMatch[1]);
  }

  const ownsFinalSignoffMatch = text.match(/\b(.+?)\b(?:nobody has confirmed who owns|who owns)\s+(?:the\s+)?(final\s+signoff|final\s+approval)(?:\s+for\s+(?:the\s+)?(.+?))?[.!?]/i);
  if (ownsFinalSignoffMatch) {
    const subject = ownsFinalSignoffMatch[3] || ownsFinalSignoffMatch[1];
    return cleanOwnershipItem(`${subject} ${ownsFinalSignoffMatch[2]}`);
  }

  const finalSignoffMatch = text.match(/\b(.+?)\s+(?:final\s+signoff|final\s+approval)\b/i);
  if (finalSignoffMatch) {
    return cleanOwnershipItem(`${finalSignoffMatch[1]} final approval`);
  }

  return "";
}

function cleanOwnershipItem(value) {
  return summarizeText(value
    .replace(/\b(still|the|a|an|is|are|and|or|assigned|yet|needs)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.'"]+$/g, "")
    .toLowerCase()).slice(0, 72);
}

function ownerForRisk(text, fallbackOwner) {
  if (/payment|webhook|checkout/i.test(text)) return fallbackOwner || "Payment owner";
  if (/deploy|deployment|infra|rollback|staging/i.test(text)) return "Infra / Release owner";
  if (/security review|security approval|signoff/i.test(text)) return "Missing";
  if (/no owner|who owns|tbd|unowned/i.test(text)) return "Missing";
  if (/qa|regression|build candidate/i.test(text)) return "QA owner";
  if (/api contract|frontend|checkout screens/i.test(text)) return "API / Frontend owner";
  return fallbackOwner || "Unclear";
}

function impactForCategory(type, text) {
  if (type === "blocker") return "Delivery can stall until this is resolved.";
  if (type === "dependency") return "Validation or handoff work can be delayed.";
  if (type === "missing_owner") return "The work may stall without an accountable owner.";
  if (type === "decision_conflict") return "The team may reach launch day with unresolved assumptions.";
  return "This increases launch uncertainty and reduces team execution buffer.";
}

function actionForCategory(type, text) {
  const topic = readableTopic(text);
  if (type === "blocker") {
    if (/payment|webhook|checkout/i.test(text)) return "Assign a payment backup owner and require checkout proof before launch review.";
    if (/deploy|deployment|infra|rollback|staging/i.test(text)) return "Assign an infra approval owner and require rollback proof before launch review.";
    if (/qa|regression|build candidate/i.test(text)) return "Freeze the build candidate or assign a QA unblock owner before launch review.";
    return `Assign an owner or backup for ${topic} and require proof.`;
  }
  if (type === "dependency") {
    if (/onboarding|design tokens|ui package/i.test(text)) return "Freeze the final UI package or split onboarding work into blocked and unblocked paths.";
    if (/api contract|checkout screens|frontend/i.test(text)) return "Freeze the API contract or split checkout work into blocked and unblocked paths.";
    if (/qa|regression|build candidate/i.test(text)) return "Freeze the build candidate or assign a QA unblock owner before launch review.";
    if (/customer support|support docs|escalation/i.test(text)) return "Name one support escalation owner and deadline before launch review.";
    if (/customer comms|announcement|release notes/i.test(text)) return "Name one customer comms signoff owner and deadline today.";
    if (/security approval|security review|signoff/i.test(text)) return "Name a security approval owner and lock final release scope before launch review.";
    return "Resolve this dependency or split an unblocked path.";
  }
  if (type === "missing_owner") {
    if (/pricing/i.test(text)) return "Name one pricing approval owner and set a signoff deadline today.";
    if (/legal review|legal approval|legal/i.test(text)) return "Name one legal review owner and set a signoff deadline today.";
    if (/customer support|support docs|escalation/i.test(text)) return "Name one support escalation owner and deadline before launch review.";
    if (/^customer comms|announcement/i.test(text)) return "Name one customer comms signoff owner and deadline today.";
    if (/security review|security approval|signoff/i.test(text)) return "Name one security approval owner and set a signoff deadline today.";
    return `Name one owner for ${topic} and set a deadline.`;
  }
  if (type === "decision_conflict") return "Resolve the conflicting launch assumption in-channel and record the decision.";
  return "Assign an owner and confirm the next action in Slack.";
}

function scenarioKeywordPatterns(normalizedScenario) {
  const words = normalizedScenario
    .split(/[^a-z0-9]+/i)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4 && !/what|if|slips?|delay|delayed|late|days?|risk/.test(word));
  return words.slice(0, 4).map((word) => new RegExp(escapeRegExp(word), "i"));
}

function scenarioRiskPatterns(normalizedScenario) {
  const words = normalizedScenario
    .split(/[^a-z0-9]+/i)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4 && !/what|if|slips?|delay|delayed|late|days?|risk/.test(word));
  const riskWords = "(blocker|blocked|blocking|failing|failure|broken|cannot start|can't start|delayed|delay|stuck|not ready|unstable|waits on|waiting on|depends on)";
  return words.slice(0, 4).map((word) => new RegExp(`(?=.*${escapeRegExp(word)})(?=.*${riskWords})`, "i"));
}

function scenarioTopic(scenario, fallbackText) {
  const words = scenario
    .split(/[^a-z0-9]+/i)
    .filter((word) => word.length >= 4 && !/what|if|slips?|delay|delayed|late|days?|risk/.test(word));
  return words.slice(0, 2).join(" ") || readableTopic(fallbackText);
}

function citationFromMessage(message) {
  return {
    label: `${message.channel} ${message.author}`,
    sender: message.author,
    timestamp: message.ts,
    channel: message.channel,
    quote: message.text,
    url: message.permalink,
    source: "slack"
  };
}

function normalizeDecision(text) {
  return text.replace(/^Decision:\s*/i, "").trim();
}

function summarizeText(text) {
  return text.length > 100 ? `${text.slice(0, 97)}...` : text;
}

function titleFromTopic(prefix, text) {
  return `${prefix}: ${readableTopic(text)}`;
}

function topicFromText(text) {
  return normalizeTopic(readableTopic(text));
}

function normalizeTopic(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function normalizeRiskText(value = "") {
  return value
    .toLowerCase()
    .replace(/\b(owners|items|dependencies|approvals)\b/g, (match) => match.slice(0, -1))
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sentenceList(items) {
  if (items.length <= 1) return items[0] || "key risks";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function readableTopic(text) {
  const firstSentence = stripLeadIn(text).split(/[.!?]/)[0];
  const beforeReason = firstSentence.split(/\b(?:because|but|unless|so that|which means)\b/i)[0].trim();
  const cleaned = (beforeReason || firstSentence)
    .replace(/\b(today|tomorrow|right now|still|because|unless|before launch review|before the next review)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return summarizeText(cleaned.replace(/[.'"]+$/g, "")).slice(0, 72).toLowerCase();
}

function stripLeadIn(text) {
  return text
    .replace(/^(Decision|Blocker|Risk|Update|FYI):\s*/i, "")
    .replace(/^can someone confirm if\s+/i, "")
    .trim();
}

function capitalize(value) {
  if (!value) return value;
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
