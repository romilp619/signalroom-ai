# Privacy And Security

SignalRoom is designed for high-trust workspaces.

## Principles

- Analyze only project channels and tools selected by the workspace admin.
- Cite evidence so users can verify every risk claim.
- Do not train models on customer Slack data.
- Keep raw context short-lived where possible.
- Store derived risk signals separately from raw messages.
- Respect Slack permissions and user visibility.

## Recommended Production Controls

- Workspace-level admin approval for connected channels and MCP tools.
- Per-channel opt-in before analysis.
- Audit log for every generated risk brief.
- Retention controls for cached context.
- Redaction for secrets, credentials, and personal data.
- Clear labels for AI-generated recommendations.

## Judge-Friendly Explanation

SignalRoom does not replace human judgment. It turns scattered work signals into evidence-backed recommendations, then asks the team to confirm owners, deadlines, and decisions in Slack.

