# Implementation Notes

## Current MVP

- Runnable local demo with deterministic project data.
- Slack app manifest and `/signalroom` command.
- App mention support.
- Block Kit responses for risk radar, what-if simulation, decision timeline, and rescue brief.
- Risk engine with blockers, contradictions, missing owners, owner overload, deadline pressure, and launch criteria detection.
- Provider boundaries for Slack Real-Time Search and MCP-based external tools.

## Production Wiring

The current demo dataset should be replaced with:

1. `SlackRealtimeSearchProvider.searchProjectContext` for live Slack messages.
2. `McpContextProvider.getIssues` for GitHub, Linear, or Jira.
3. `McpContextProvider.getDocs` for Notion or Google Drive.
4. `McpContextProvider.getCalendarEvents` for launch reviews and availability.
5. `normalizeWorkspaceContext` before passing evidence into the risk engine.

## First-Place Polish Checklist

- Record the demo in a real Slack workspace.
- Use a seeded project channel with realistic launch chaos.
- Show cited evidence links.
- Click the rescue brief button live.
- Show architecture diagram after the product demo.
- Emphasize: prediction, not summarization.

