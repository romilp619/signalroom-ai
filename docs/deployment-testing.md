# Deployment and Judge Testing Checklist

Use this checklist to remove the two biggest submission risks: judges cannot access the app, or the submission overstates Real-Time Search.

## Required For Judging

1. Run SignalRoom in a Slack workspace the judges can access.
2. Invite `slackhack@salesforce.com` and `testing@devpost.com`.
3. Add both accounts to the demo channel.
4. Keep the app online during the judging window.
5. Provide the Slack workspace URL and the demo channel name in Devpost.

## Recommended Deployment

SignalRoom works well with Socket Mode, so the host only needs to run the Node process and keep outbound internet access open.

Environment variables:

```bash
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
PORT=3000
SIGNALROOM_AI_ENABLED=true
SIGNALROOM_RTS_ENABLED=true
SIGNALROOM_MCP_ENABLED=true
MCP_SERVER_URLS=https://your-mcp-server.example/mcp
SIGNALROOM_DEBUG=false
```

Start command:

```bash
npm install
npm start
```

Local demo MCP server:

```bash
npm run mcp:demo
```

For a deployed demo, replace the local MCP server with a reachable HTTPS endpoint, or set `SIGNALROOM_MCP_ENABLED=false` and describe MCP as optional/local-demo enrichment.

## Real-Time Search Honesty Check

SignalRoom has a Real-Time Search provider for Slack `assistant.search.context`.

Use this wording when Real-Time Search is not active:

> SignalRoom includes Real-Time Search support and safely falls back to channel history when Slack assistant search context is not available.

Use this wording only when logs show `RTS search used`:

> SignalRoom uses Slack Real-Time Search to retrieve relevant project context before analysis.

With `SIGNALROOM_DEBUG=true`, check logs:

- `RTS search used` means Real-Time Search was active.
- `RTS search fallback used` means the demo used channel history instead.
- `MCP tools used` means configured MCP tools contributed external evidence.

## Final Demo Smoke Test

In a fresh Slack channel:

1. Invite `@SignalRoom`.
2. Post 6-10 project messages with a mix of decisions, blockers, missing owners, dependencies, and overload.
3. Run `/signalroom launch`.
4. Click `Create rescue brief`.
5. Click `Show timeline`.
6. Run `/signalroom whatif deployment slips 2 days`.
7. Run `/signalroom whatif payment slips 2 days` when payment is not mentioned, to show low-confidence honesty.

Expected result:

- Launch output shows top 3 risks.
- Evidence quotes point to real Slack or MCP messages.
- Timeline is compact and deduplicated.
- Unsupported what-if topics show low confidence instead of invented evidence.
