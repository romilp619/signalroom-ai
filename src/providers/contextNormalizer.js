export function normalizeWorkspaceContext({ project, slackMessages = [], issues = [], docs = [], calendar = [] }) {
  return {
    project,
    messages: slackMessages.map(normalizeSlackMessage),
    issues: issues.map(normalizeIssue),
    docs: docs.map(normalizeDoc),
    calendar: calendar.map(normalizeCalendarEvent)
  };
}

function normalizeSlackMessage(message) {
  return {
    id: message.id || message.ts,
    ts: message.ts,
    author: message.author || message.user || "Unknown",
    channel: message.channel || "unknown-channel",
    text: message.text || "",
    permalink: message.permalink || message.url || ""
  };
}

function normalizeIssue(issue) {
  return {
    id: issue.id,
    title: issue.title,
    owner: issue.owner || issue.assignee || null,
    status: issue.status || "unknown",
    priority: issue.priority || "medium",
    due: issue.due || issue.dueDate || null,
    url: issue.url || ""
  };
}

function normalizeDoc(doc) {
  return {
    id: doc.id,
    title: doc.title,
    status: doc.status || "unknown",
    owner: doc.owner || null,
    text: doc.text || doc.summary || "",
    url: doc.url || ""
  };
}

function normalizeCalendarEvent(event) {
  return {
    id: event.id,
    title: event.title,
    time: event.time || event.start,
    attendees: event.attendees || []
  };
}
