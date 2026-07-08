const MAX_SECTION_LENGTH = 2900;
const MAX_BLOCKS = 45;
const ICON = {
  risk: "\u{1F6A8}",
  critical: "\u{1F534}",
  high: "\u{1F7E0}",
  medium: "\u{1F7E1}",
  low: "\u{1F7E2}",
  why: "\u{1F9ED}",
  evidence: "\u{1F50E}",
  rescue: "\u{1F6DF}",
  timeline: "\u{1F552}",
  whatIf: "\u{1F9EA}"
};

export function launchBlocks(analysis) {
  const detectedSignals = analysis.signals.slice(0, 5);
  const visibleSignals = detectedSignals.slice(0, 3);
  const renderedRisks = visibleSignals
    .map((signal, index) =>
      numberedRisk(signal, index, 70, true, 1, {
        includeConfidence: false,
        includeReason: false,
        compactAction: true
      }).trim()
    )
    .join("\n\n");
  const rescueMode = analysis.riskScore >= 80
    ? "*Rescue mode:* Recommended — assign backup owner, freeze build, confirm launch decision."
    : null;
  const risksSection = joinLines([
    `${ICON.evidence} *Top evidence-backed risks*`,
    "",
    renderedRisks
  ]);
  const recommendationsSection = titledSection(`${ICON.rescue} Recommended rescue moves`, bulletList(analysis.recommendedActions.slice(0, 4).map(conciseAction)));
  const launchText = joinSections([
    `${ICON.risk} *SignalRoom Risk Radar — ${escapeMrkdwnText(analysis.project.name)}*`,
    fieldBlock([
      ["Status", `${statusEmoji(analysis.level)} ${analysis.level.toUpperCase()} RISK`],
      ["Readiness", `${analysis.readiness}%`],
      ["Risk score", `${analysis.riskScore}%`]
    ]),
    `SignalRoom detected *${detectedSignals.length} top launch risks* from *${analysis.messageCount} project messages*.`,
    `Showing top *${visibleSignals.length}* of *${detectedSignals.length}* detected launch risks.`,
    formatReadinessSummary(analysis.summary),
    titledSection(`${ICON.why} Why this is risky`, analysis.scoreExplanation),
    risksSection,
    recommendationsSection,
    rescueMode
  ]);

  return [
    ...mrkdwnBlocks(launchText),
    actions([
      button("Create rescue brief", "signalroom_brief", "brief", "primary"),
      button("Show timeline", "signalroom_timeline", "timeline"),
      button("Simulate payment slip", "signalroom_whatif_payment", "whatif payment slips 2 days", "danger")
    ])
  ];
}

export function whatIfBlocks(simulation) {
  const text = joinSections([
    `${ICON.whatIf} *SignalRoom What-if Simulation*`,
    fieldBlock([
      ["Scenario", simulation.scenario],
      ["Confidence", simulation.confidence],
      ["Current", `readiness ${simulation.currentReadiness}%, risk ${simulation.currentRisk}%`],
      ["Projected", `readiness ${simulation.projectedReadiness}%, risk ${simulation.projectedRisk}%`]
    ]),
    titledSection("Affected dependencies", bulletList(simulation.affectedDependencies.slice(0, 3).map((item) =>
      cleanDependency(item, simulation.scenario)
    ))),
    titledSection("Chain reaction", numberedList(simulation.chainReaction.slice(0, 4).map((item) =>
      cleanChainReaction(item, simulation.scenario)
    ))),
    titledSection("Best rescue move", conciseAction(simulation.bestRescueMove))
  ]);

  return mrkdwnBlocks(text);
}

export function timelineBlocks(timeline, options = {}) {
  if (options.includeEvidence) {
    const evidenceItems = timeline.length
      ? timeline.slice(0, 8).map((item) =>
          joinLines([
            `*${formatDate(item.time)} | ${item.type}*`,
            escapeMrkdwnText(item.summary),
            formatEvidenceLine(item.evidence)
          ])
        )
      : ["No evidence-backed launch events found yet."];

    return mrkdwnBlocks(joinSections([
      `${ICON.timeline} *SignalRoom Decision Timeline*`,
      ...evidenceItems
    ]));
  }

  const items = timeline.length
    ? compactTimelineItems(timeline).map((item) => `• ${formatTime(item.time)} — ${escapeMrkdwnText(item.text)}`)
    : ["No evidence-backed launch events found yet."];

  return mrkdwnBlocks(joinSections([
    `${ICON.timeline} *SignalRoom Decision Timeline*`,
    items.join("\n"),
    "_Run `/signalroom timeline --evidence` for full evidence._"
  ]));
}

export function briefBlocks(brief) {
  const prioritySections = brief.priorities.map((priority, index) =>
    joinLines([
      `*${index + 1}. ${escapeMrkdwnText(compactPriorityTitle(priority.risk))}*`,
      field("Owner", priority.owner),
      field("Action", conciseAction(priority.action)),
      field("Evidence", `"${shortEvidenceQuote(priority.evidence[0])}"`)
    ])
  );

  return mrkdwnBlocks(joinSections([
    `${ICON.risk} *${escapeMrkdwnText(titleCase(brief.title))}*`,
    fieldBlock([
      ["Risk", `${brief.riskScore}%`],
      ["Readiness", `${brief.readiness}%`]
    ]),
    titledSection(`${ICON.why} Why this is risky`, compactWhy(brief.scoreExplanation)),
    `${ICON.evidence} *Top 3 rescue priorities*`,
    ...prioritySections,
    brief.nextMeeting ? field("Next review", formatDate(brief.nextMeeting.time)) : null
  ].filter(Boolean)));
}

export function helpBlocks() {
  return mrkdwnBlocks(joinSections([
    "*SignalRoom*",
    "Ask SignalRoom to detect hidden project risks before they become delays.",
    "`/signalroom launch`\n`/signalroom whatif payment slips 2 days`\n`/signalroom timeline`\n`/signalroom brief`\n`/signalroom clean`"
  ]));
}

function numberedRisk(signal, index, quoteLimit = 140, wordBoundaryQuotes = false, evidenceLimit = 2, options = {}) {
  const includeConfidence = options.includeConfidence !== false;
  const includeReason = options.includeReason !== false;
  return joinSections([
    joinLines([
      `*${index + 1}. ${escapeMrkdwnText(signal.title)}*`,
      field("Severity", signal.severityLabel || severityLabel(signal.severity)),
      ...(includeConfidence ? [field("Confidence", signal.confidence || "High")] : []),
      field("Owner", signal.owner || "Missing"),
      ...(signal.tasks?.length ? [field("Tasks", signal.tasks.join(", "))] : []),
      ...(includeReason && signal.reason ? [field("Reason", signal.reason)] : []),
      field("Impact", signal.impact),
      field("Action", options.compactAction ? conciseAction(signal.recommendedAction) : signal.recommendedAction)
    ]),
    evidenceList(signal.evidence, evidenceLimit, quoteLimit, wordBoundaryQuotes)
  ]);
}

function evidenceList(evidence = [], limit = 2, quoteLimit = 140, wordBoundaryQuotes = false) {
  const items = evidence.slice(0, limit);
  if (!items.length) return null;
  return titledSection("Evidence:", items.map((item) => formatEvidenceBullet(item, quoteLimit, wordBoundaryQuotes)).join("\n"));
}

function fieldBlock(rows) {
  return rows.map(([label, value]) => field(label, value)).join("\n");
}

function field(label, value) {
  return `*${label}:* ${escapeMrkdwnText(value)}`;
}

function titledSection(title, body) {
  if (!body) return null;
  return `${formatSectionTitle(title)}\n${escapeMrkdwnText(body)}`;
}

function bulletList(items, marker = "•") {
  return items.map((item) => `${marker} ${item}`).join("\n");
}

function numberedList(items) {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function joinSections(items) {
  return items.filter(Boolean).join("\n\n");
}

function joinLines(items) {
  return items.join("\n");
}

function escapeMrkdwnText(value = "") {
  return String(value)
    .replace(/&(?!amp;|lt;|gt;)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatSectionTitle(title) {
  for (const prefix of [`${ICON.why} `, `${ICON.evidence} `, `${ICON.rescue} `, `${ICON.whatIf} `, `${ICON.timeline} `, `${ICON.risk} `]) {
    if (title.startsWith(prefix)) {
      return `${prefix}*${title.slice(prefix.length)}*`;
    }
  }
  return `*${title}*`;
}

function mrkdwnBlocks(text) {
  const chunks = chunkMrkdwnText(text, MAX_SECTION_LENGTH);
  const safeChunks = chunks.length > MAX_BLOCKS
    ? chunkMrkdwnText(compactFallbackText(text), MAX_SECTION_LENGTH)
    : chunks;
  return safeChunks.map((chunk) => section(`${chunk}\n\n`));
}

export function chunkMrkdwnText(text, maxChars = MAX_SECTION_LENGTH) {
  const chunks = [];
  let remaining = text.trim();

  while (remaining.length > maxChars) {
    let splitAt = remaining.lastIndexOf("\n\n", maxChars);
    if (splitAt < maxChars * 0.5) splitAt = remaining.lastIndexOf("\n", maxChars);
    if (splitAt < maxChars * 0.5) splitAt = remaining.lastIndexOf(". ", maxChars);
    if (splitAt < maxChars * 0.5) splitAt = remaining.lastIndexOf(" ", maxChars);
    if (splitAt < maxChars * 0.5) splitAt = maxChars;

    const chunk = remaining.slice(0, splitAt).trim();
    if (chunk) chunks.push(chunk);
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function compactFallbackText(text) {
  const lines = text.split("\n");
  const keepers = lines.filter((line) =>
    /SignalRoom Risk Radar|Status:|Readiness:|Risk score:|SignalRoom detected|Why this is risky|Top evidence-backed risks|^\*\d+\.|Severity:|Owner:|Recommended rescue moves|Rescue mode/.test(line)
  );
  return joinSections([
    keepers.join("\n"),
    "_SignalRoom shortened this response because Slack limits Block Kit messages to 45 blocks._"
  ]);
}

function formatEvidenceBullet(item, quoteLimit = 140, wordBoundary = false) {
  const quote = wordBoundary ? truncateAtWordBoundary(item.quote, quoteLimit) : truncate(item.quote, quoteLimit);
  return `• *${escapeMrkdwnText(item.sender)}* in *${escapeMrkdwnText(item.channel)}* at ${formatDate(item.timestamp)}: "${escapeMrkdwnText(quote)}"`;
}

function formatEvidenceLine(item) {
  if (!item) return "*Evidence:* not available";
  return `*Evidence:* ${escapeMrkdwnText(item.sender)} in ${escapeMrkdwnText(item.channel)} at ${formatDate(item.timestamp)} - "${escapeMrkdwnText(truncate(item.quote, 120))}"`;
}

function statusEmoji(level) {
  if (/critical/i.test(level)) return ICON.critical;
  if (/high/i.test(level)) return ICON.high;
  if (/medium/i.test(level)) return ICON.medium;
  return ICON.low;
}

function formatReadinessSummary(summary) {
  return escapeMrkdwnText(summary).replace(/^Launch readiness is (\d+%)/i, "*Launch readiness:* $1");
}

function compactPriorityTitle(title) {
  if (/overloaded|owner overload/i.test(title)) return "Owner overload";
  if (/decision conflict/i.test(title)) return "Decision conflict";
  if (/missing owner/i.test(title)) return "Missing owner";
  if (/blocker/i.test(title)) return "Blocker";
  if (/qa dependency|api contract|build candidate|frontend/i.test(title)) return "QA dependency";
  if (/launch-date|release date|launch date/i.test(title)) return "Launch-date risk";
  return title;
}

function compactWhy(text) {
  return text
    .replace(/^Risk is high because /i, "")
    .replace(/ are unresolved in Slack evidence\.$/i, " are unresolved.")
    .replace(/^owner overload/i, "Owner overload")
    .replace(/qa\/dependency risk/ig, "QA/dependency risk")
    .replace(/missing ownership/ig, "missing ownership")
    .replace(/decision conflict/ig, "decision conflict")
    .replace(/blockers/ig, "blockers");
}

function compactTimelineEvent(item) {
  const summary = cleanSummary(item.summary);
  const quote = item.evidence?.quote || item.summary;
  const sender = item.evidence?.sender || "Owner";

  if (/decision/i.test(item.type)) {
    if (/thursday|release date|launch date|locked/i.test(quote) && /api|deployment|security/i.test(quote)) {
      return "Decision: Thursday release locked unless API/deployment/security changes.";
    }
    return `Decision: ${summary}`;
  }
  if (/I own|I am handling|I'm handling|backup would help|too many/i.test(quote)) {
    return `Owner overload: ${sender} owns ${countOwnedTasks(quote)} launch-critical items.`;
  }
  if (/onboarding|design tokens|final UI package/i.test(quote)) {
    return "QA dependency: Onboarding waits on final UI package.";
  }
  if (/api contract|checkout screens/i.test(quote)) {
    return "QA dependency: Frontend blocked by API contract.";
  }
  if (/frontend/i.test(quote)) {
    return `Frontend dependency: ${summary}`;
  }
  if (/deploy|deployment|infra|rollback/i.test(quote)) {
    return "Blocker: Deployment waits on infra approval and rollback proof.";
  }
  if (/legal review|legal approval/i.test(quote) && /no owner|who owns|final approval|signoff/i.test(quote)) {
    return "Missing owner: Legal review final approval.";
  }
  if (/security review|security approval/i.test(quote) && /no owner|who owns|final approval|signoff/i.test(quote)) {
    return "Missing owner: Security review final approval.";
  }
  if (/pricing/i.test(quote) && /who owns|final signoff|final approval/i.test(quote)) {
    return "Missing owner: Pricing final signoff.";
  }
  if (/customer comms|announcement/i.test(quote) && /who owns|final signoff|final approval/i.test(quote)) {
    return "Missing owner: Customer comms final signoff.";
  }
  if (/customer support|support docs|escalation/i.test(quote) && /TBD|someone needs to|who owns|no owner/i.test(quote)) {
    return "Missing owner: Support escalation owner.";
  }
  if (/QA cannot start|full regression|build candidate/i.test(quote)) {
    return "QA risk: Full regression waits on build freeze.";
  }
  return `${item.type}: ${summary}`;
}

function compactTimelineItems(timeline) {
  const byEvent = new Map();

  for (const item of timeline) {
    const text = compactTimelineEvent(item);
    const key = normalizeCompactTimelineKey(text);
    const current = byEvent.get(key);
    const candidate = { item, text, confirmedByMcp: isMcpEvidence(item.evidence) };

    if (!current) {
      byEvent.set(key, candidate);
      continue;
    }

    if (isMcpEvidence(item.evidence)) {
      current.confirmedByMcp = true;
      continue;
    }

    if (isMcpEvidence(current.item.evidence) && !isMcpEvidence(item.evidence)) {
      byEvent.set(key, {
        item,
        text,
        confirmedByMcp: current.confirmedByMcp
      });
    }
  }

  return [...byEvent.values()]
    .sort((a, b) => new Date(a.item.time) - new Date(b.item.time))
    .slice(0, 6)
    .map(({ item, text, confirmedByMcp }) => ({
      time: item.time,
      text: confirmedByMcp && !/\(also confirmed by MCP\)$/.test(text)
        ? `${text} (also confirmed by MCP)`
        : text
    }));
}

function normalizeCompactTimelineKey(text) {
  return text
    .replace(/\s+\(also confirmed by MCP\)$/i, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMcpEvidence(evidence) {
  return /mcp|github\/issues|linear\/project-risk/i.test(`${evidence?.sender || ""} ${evidence?.channel || ""}`);
}

function cleanDependency(value, scenario) {
  const topic = scenarioTopic(scenario);
  let text = value
    .replace(new RegExp(`No direct evidence found for ${topic} in recent Slack or MCP context\\.`, "i"), `No direct ${topic} evidence found.`)
    .replace(/API contract is blocking checkout screens/i, "API contract blocks checkout screens")
    .replace(/Security review approval has no owner/i, "Security review has no owner")
    .trim();
  return withPeriod(text);
}

function cleanChainReaction(value, scenario) {
  const topic = scenarioTopic(scenario);
  let text = value
    .replace(new RegExp(`No direct evidence found for ${topic}; simulation is low confidence\\.`, "i"), `Simulation is low confidence because ${topic} is not mentioned.`)
    .replace(/SignalRoom is using general launch risks instead\./i, "SignalRoom falls back to general launch risks.")
    .replace(/Validate the scenario in-channel before making a launch decision\./i, `Team should confirm ${topic} scope before deciding.`)
    .trim();
  return withPeriod(text);
}

function conciseAction(value) {
  return value
    .replace(/Confirm whether payment is in launch scope\. If yes, assign an owner and post payment test evidence before launch review\./i, "Confirm whether payment is in scope. If yes, assign owner and post payment test evidence.")
    .replace(/Move at least one critical item to a backup owner today\./i, "Move one critical item to a backup owner.")
    .replace(/Resolve the launch-date versus QA assumption and record the decision\./i, "Resolve the Thursday launch assumption.")
    .replace(/Name one security approval owner and set a signoff deadline today\./i, "Assign one security approval owner today.")
    .trim();
}

function shortEvidenceQuote(item) {
  if (!item?.quote) return "Evidence not available.";
  const sentences = item.quote
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/^(Decision|Blocker):\s*/i, "").trim())
    .filter(Boolean);
  const scored = sentences
    .map((sentence) => ({ sentence, score: evidenceSentenceScore(sentence) }))
    .sort((a, b) => b.score - a.score);
  return truncateAtWordBoundary(scored[0]?.sentence || item.quote, 150);
}

function evidenceSentenceScore(sentence) {
  let score = 0;
  if (/backup would help|too many|overloaded|critical items/i.test(sentence)) score += 5;
  if (/no owner|who owns|final approval|final signoff|signoff/i.test(sentence)) score += 5;
  if (/deployment waits|infra approval|rollback proof|not ready|unstable/i.test(sentence)) score += 4;
  if (/release date|launch date|locked|unless/i.test(sentence)) score += 4;
  if (/api contract|checkout screens|build candidate|QA cannot start|full regression/i.test(sentence)) score += 4;
  return score;
}

function cleanSummary(value) {
  return withPeriod(value.replace(/^(Decision|Blocker):\s*/i, "").trim());
}

function countOwnedTasks(value) {
  const match = value.match(/\b(?:I own|I am handling|I'm handling|handling)\s+(.+?)(?:\s+today|\.|$)/i);
  if (!match) return "multiple";
  return match[1]
    .replace(/\band\b/gi, ",")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean).length || "multiple";
}

function scenarioTopic(scenario) {
  return scenario.match(/[a-z0-9-]+/i)?.[0]?.toLowerCase() || "scenario";
}

function withPeriod(value) {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function titleCase(value) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function severityLabel(score) {
  if (score >= 27) return "Critical";
  if (score >= 21) return "High";
  if (score >= 14) return "Medium";
  return "Low";
}

function section(text) {
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text
    }
  };
}

function actions(elements) {
  return {
    type: "actions",
    elements
  };
}

function button(text, actionId, value, style) {
  return {
    type: "button",
    text: {
      type: "plain_text",
      text
    },
    action_id: actionId,
    value,
    ...(style ? { style } : {})
  };
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function truncate(value, limit) {
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}

function truncateAtWordBoundary(value, limit) {
  if (value.length <= limit) return value;
  const slice = value.slice(0, limit - 3);
  const boundary = slice.lastIndexOf(" ");
  const trimmed = (boundary > 40 ? slice.slice(0, boundary) : slice).trimEnd();
  return `${trimmed}...`;
}
