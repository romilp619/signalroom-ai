# Devpost Submission Draft

## Project Name

SignalRoom

## Tagline

The Slack agent that detects hidden project risks before they become delays.

## Inspiration

Teams do not usually miss deadlines because nobody cared. They miss them because the warning signs were scattered across Slack threads, project tickets, docs, meetings, and half-remembered decisions. SignalRoom turns those weak signals into a live risk room inside Slack.

## What It Does

SignalRoom is a new Slack agent for project teams. It answers questions like:

- Are we going to miss launch?
- What changed since yesterday?
- What decisions led us here?
- What if payment slips by two days?
- Who is overloaded or missing as an owner?

It produces a risk score, cited evidence, hidden blockers, contradictions, missing owners, owner overload, what-if impact, and a rescue brief.

## How We Built It

SignalRoom has a Slack-native agent layer, an evidence normalizer, a risk graph, a signal engine, Slack search-provider support, and optional MCP connector boundaries.

The live Slack app reads real channel messages through Slack APIs and can enrich them with optional MCP project context. SignalRoom includes a Real-Time Search provider for Slack assistant search context; when that context is unavailable, it explicitly falls back to channel history instead of pretending search was used.

## Challenge Technologies

- New Slack Agent
- Slack AI capabilities
- Real-Time Search API support with channel-history fallback
- Optional MCP integration for external project evidence

## What Makes It Unique

Most Slack agents summarize what happened. SignalRoom predicts what will break next. It does not stop at "here is the status"; it says "here is the risk, here is the evidence, here is the likely failure path, and here is the rescue plan."

## Demo Script

1. Show a messy launch channel with scattered messages.
2. Run `/signalroom launch`.
3. SignalRoom returns launch risk, blockers, contradictions, missing owners, and citations.
4. Run `/signalroom whatif deployment slips 2 days`.
5. SignalRoom simulates the effect on launch readiness using matching evidence.
6. Run `/signalroom timeline`.
7. SignalRoom shows the decision timeline.
8. Run `/signalroom brief`.
9. SignalRoom posts an executive-ready launch rescue brief.

## Impact

SignalRoom helps teams avoid preventable delays, protects overloaded teammates, shortens project catch-up time, and makes Slack a place where work becomes clearer instead of more scattered.
