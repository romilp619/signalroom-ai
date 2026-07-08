export const demoWorkspace = {
  project: {
    name: "Atlas Launch",
    launchDate: "2026-07-05",
    today: "2026-06-30",
    channel: "#proj-atlas-launch",
    owner: "Maya"
  },
  messages: [
    {
      id: "m1",
      ts: "2026-06-28T09:14:00+05:30",
      author: "Maya",
      channel: "#proj-atlas-launch",
      text: "Decision: we are keeping the public launch date at Friday unless payment or QA changes.",
      permalink: "slack://channel/proj-atlas-launch/m1"
    },
    {
      id: "m2",
      ts: "2026-06-29T10:02:00+05:30",
      author: "Priya",
      channel: "#proj-atlas-launch",
      text: "Blocker: payment webhook retries are still failing in staging. I can keep digging after auth QA.",
      permalink: "slack://channel/proj-atlas-launch/m2"
    },
    {
      id: "m3",
      ts: "2026-06-29T11:40:00+05:30",
      author: "Leo",
      channel: "#proj-atlas-launch",
      text: "QA cannot start until Friday morning because the build candidate is not frozen yet.",
      permalink: "slack://channel/proj-atlas-launch/m3"
    },
    {
      id: "m4",
      ts: "2026-06-29T14:18:00+05:30",
      author: "Sara",
      channel: "#proj-atlas-launch",
      text: "Pricing page copy still needs final approval. I do not know who owns the final signoff.",
      permalink: "slack://channel/proj-atlas-launch/m4"
    },
    {
      id: "m5",
      ts: "2026-06-30T09:05:00+05:30",
      author: "Maya",
      channel: "#proj-atlas-launch",
      text: "Can someone confirm if analytics events are done? Yesterday we said they were almost there.",
      permalink: "slack://channel/proj-atlas-launch/m5"
    },
    {
      id: "m6",
      ts: "2026-06-30T09:42:00+05:30",
      author: "Nikhil",
      channel: "#proj-atlas-launch",
      text: "Docs are ready, but onboarding screenshots will change if the pricing screen changes.",
      permalink: "slack://channel/proj-atlas-launch/m6"
    },
    {
      id: "m7",
      ts: "2026-06-30T10:20:00+05:30",
      author: "Priya",
      channel: "#proj-atlas-launch",
      text: "I own payment webhook, auth QA, launch checklist, and rollback plan today. Backup would help.",
      permalink: "slack://channel/proj-atlas-launch/m7"
    },
    {
      id: "m8",
      ts: "2026-06-30T11:12:00+05:30",
      author: "Leo",
      channel: "#proj-atlas-launch",
      text: "Decision: do not launch unless we complete a full checkout test and rollback drill.",
      permalink: "slack://channel/proj-atlas-launch/m8"
    }
  ],
  issues: [
    {
      id: "GH-182",
      title: "Payment webhook retry failure in staging",
      owner: "Priya",
      status: "open",
      priority: "critical",
      due: "2026-07-01",
      url: "https://github.com/example/atlas/issues/182"
    },
    {
      id: "GH-176",
      title: "Auth QA checklist",
      owner: "Priya",
      status: "in_progress",
      priority: "high",
      due: "2026-07-01",
      url: "https://github.com/example/atlas/issues/176"
    },
    {
      id: "LIN-93",
      title: "Analytics event verification",
      owner: "Amir",
      status: "in_progress",
      priority: "medium",
      due: "2026-07-02",
      url: "https://linear.app/example/issue/LIN-93"
    },
    {
      id: "LIN-101",
      title: "Rollback plan",
      owner: "Priya",
      status: "todo",
      priority: "critical",
      due: "2026-07-02",
      url: "https://linear.app/example/issue/LIN-101"
    }
  ],
  docs: [
    {
      id: "doc-1",
      title: "Atlas Launch Readiness Checklist",
      status: "draft",
      owner: "Maya",
      text: "Launch requires checkout test, rollback drill, pricing approval, and final QA signoff.",
      url: "https://docs.example.com/atlas-launch-checklist"
    },
    {
      id: "doc-2",
      title: "Pricing Page Approval",
      status: "needs_owner",
      owner: null,
      text: "Final approval still pending. Legal and finance comments are unresolved.",
      url: "https://docs.example.com/pricing-approval"
    }
  ],
  calendar: [
    {
      id: "cal-1",
      title: "Launch review",
      time: "2026-07-02T16:00:00+05:30",
      attendees: ["Maya", "Priya", "Leo", "Sara"]
    },
    {
      id: "cal-2",
      title: "QA pass",
      time: "2026-07-03T09:00:00+05:30",
      attendees: ["Leo", "Priya"]
    }
  ]
};
