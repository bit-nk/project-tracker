/**
 * Deterministic stub dataset.
 *
 * Generated once from a fixed seed via `mulberry32`, so the demo is identical
 * across reloads. Only `repo.ts` imports this. When the real backend arrives,
 * this file is deleted and `repo.ts` swaps to `fetch()`.
 *
 * Model reminder: a Project is an Approved SoW. Approved specs below get project
 * fields (workStatus, startedAt) and a log; log entries are keyed by SoW id.
 */
import { SeededRandom } from "@/lib/rng";
import type {
  Client,
  ClientContact,
  ProjectLogEntry,
  Sow,
  SowStatus,
  WorkStatus,
  LogEntryType,
} from "@/types";

export interface SeedData {
  clients: Client[];
  sows: Sow[];
  logEntries: ProjectLogEntry[];
}

// Fixed reference "now" so generated dates are stable. Relative labels drift
// against the real clock over time - expected; absolute dates stay put.
const ANCHOR = new Date("2026-07-18T16:00:00.000Z").getTime();
const DAY = 24 * 60 * 60 * 1000;
const iso = (msFromAnchor: number) => new Date(ANCHOR + msFromAnchor).toISOString();
const daysAgo = (d: number) => iso(-d * DAY);

const CLIENTS: {
  name: string;
  industry: string;
  contacts: ClientContact[];
  notes?: string;
}[] = [
  {
    name: "Northwind Trading",
    industry: "Wholesale / Distribution",
    contacts: [
      { name: "Dana Whitfield", contact: "dana@northwind.example", role: "Ops lead / main contact" },
      { name: "Marcus Lee", contact: "marcus@northwind.example", role: "Approver (budget)" },
    ],
    notes: "Prefers Friday check-ins. Slow to send docs back, chase early.",
  },
  {
    name: "Meridian Health",
    industry: "Healthcare",
    contacts: [
      { name: "Dr. Priya Nair", contact: "priya.nair@meridian.example", role: "Clinical stakeholder" },
      { name: "Tom Alvarez", contact: "t.alvarez@meridian.example", role: "IT / security review" },
      { name: "Accounts Payable", contact: "ap@meridian.example", role: "Billing" },
    ],
    notes: "HIPAA-adjacent - everything gated on Tom's security sign-off.",
  },
  {
    name: "Cobalt Robotics",
    industry: "Manufacturing / Robotics",
    contacts: [{ name: "Wren Okafor", contact: "wren@cobalt.example", role: "CTO / decision maker" }],
    notes: "Fast movers. Wren approves same-day if the scope is tight.",
  },
  {
    name: "Riverstone Legal",
    industry: "Legal services",
    contacts: [
      { name: "Helen Cho", contact: "hcho@riverstone.example", role: "Managing partner" },
      { name: "Office Manager", contact: "office@riverstone.example", role: "Scheduling / invoices" },
    ],
  },
  {
    name: "Fern & Oak Interiors",
    industry: "Retail / Design",
    contacts: [{ name: "Sofia Grant", contact: "sofia@fernoak.example", role: "Owner" }],
    notes: "Small budget, high taste. Cares a lot about visual polish.",
  },
  {
    name: "Bluewave Logistics",
    industry: "Logistics / Freight",
    contacts: [
      { name: "Raj Patel", contact: "raj.patel@bluewave.example", role: "Head of Ops" },
      { name: "Nina Torres", contact: "nina@bluewave.example", role: "Warehouse manager" },
    ],
    notes: "Integrations-heavy. Always ask about their carrier APIs up front.",
  },
  {
    name: "Sundeck Media",
    industry: "Media / Advertising",
    contacts: [{ name: "Leo Byrne", contact: "leo@sundeck.example", role: "Creative director" }],
  },
];

interface SowSpec {
  ci: number; // client index
  title: string;
  status: SowStatus;
  value?: number;
  created: number; // days before anchor
  decisionNote?: string;
}

const SOW_SPECS: SowSpec[] = [
  { ci: 0, title: "Customer Portal Rebuild", status: "Approved", value: 48000, created: 168 },
  { ci: 0, title: "Inventory Sync API", status: "Approved", value: 32000, created: 96 },
  { ci: 0, title: "Supplier Onboarding Flow", status: "Sent", value: 21000, created: 12 },
  { ci: 1, title: "Patient Intake Workflow", status: "Approved", value: 76000, created: 152 },
  { ci: 1, title: "Appointment Reminder Service", status: "Rejected", value: 18000, created: 74, decisionNote: "Went with an off-the-shelf SaaS instead - budget cycle." },
  { ci: 1, title: "Provider Analytics Dashboard", status: "Sent", value: 54000, created: 9 },
  { ci: 2, title: "Fleet Telemetry Dashboard", status: "Approved", value: 61000, created: 140 },
  { ci: 2, title: "Firmware OTA Console", status: "Approved", value: 44000, created: 58 },
  { ci: 2, title: "Warranty Claims Tool", status: "Draft", value: 27000, created: 4 },
  { ci: 3, title: "Matter Management Portal", status: "Approved", value: 39000, created: 121 },
  { ci: 3, title: "Client Intake & Conflicts Check", status: "Sent", value: 25000, created: 16 },
  { ci: 4, title: "E-commerce Checkout Revamp", status: "Approved", value: 22000, created: 110 },
  { ci: 4, title: "Lookbook Microsite", status: "Rejected", value: 9000, created: 63, decisionNote: "Client decided to DIY on Squarespace." },
  { ci: 4, title: "Inventory & Made-to-Order Tracker", status: "Draft", value: 16000, created: 2 },
  { ci: 5, title: "Shipment Tracking Portal", status: "Approved", value: 58000, created: 133 },
  { ci: 5, title: "Carrier Rate Integration", status: "Approved", value: 34000, created: 47 },
  { ci: 5, title: "Warehouse Management Tool", status: "Sent", value: 72000, created: 6 },
  { ci: 6, title: "Campaign Analytics Dashboard", status: "Approved", value: 29000, created: 88 },
  { ci: 6, title: "Marketing Site Redesign", status: "Draft", value: 14000, created: 1 },
];

// Work status per Approved SoW, in the order they appear above.
const WORK_STATUS_BY_APPROVAL: Record<number, WorkStatus> = {
  0: "Completed", // Customer Portal Rebuild
  1: "Active", // Inventory Sync API
  2: "Active", // Patient Intake Workflow
  3: "Active", // Fleet Telemetry Dashboard
  4: "On Hold", // Firmware OTA Console
  5: "Completed", // Matter Management Portal
  6: "Active", // E-commerce Checkout Revamp
  7: "On Hold", // Shipment Tracking Portal
  8: "Active", // Carrier Rate Integration
  9: "Active", // Campaign Analytics Dashboard
};

const LOG_BODIES: Record<LogEntryType, string[]> = {
  "Working On": [
    "Wiring the auth flow to the new session endpoint. Refresh-token rotation working locally.",
    "Building the data table with server-side pagination. Sorting done, filters next.",
    "Refactoring the form layer onto react-hook-form + zod. Half the screens migrated.",
    "Implementing the CSV export. Streaming rows so large exports don't blow memory.",
    "Getting the charts responsive - Recharts container sizing was fighting the grid.",
    "Hooking up optimistic updates on the status toggle so it feels instant.",
  ],
  Pending: [
    "Waiting on the client's staging DB credentials before I can test the migration.",
    "Blocked on final copy from their marketing team for the landing hero.",
    "Need Tom's security sign-off before pushing the PHI fields live.",
    "Awaiting the carrier API sandbox key - emailed Raj, no reply yet.",
    "Design review scheduled - holding the settings page until then.",
  ],
  Reminder: [
    "Invoice the first milestone at end of month - per the SoW terms.",
    "Follow up with the client on the staging credentials if still nothing by Thursday.",
    "Renew the staging TLS cert before it expires next month.",
    "Send the demo recording to Wren after the sync.",
    "Chase sign-off before the trade-show freeze.",
  ],
  Backlog: [
    "Add role-based access once the single-admin case is solid.",
    "Dark-mode polish pass across the reporting screens.",
    "Bulk actions on the list view (multi-select + archive).",
    "Audit log for edits - nice-to-have they mentioned in the kickoff.",
    "Rate-limit the public endpoints before launch.",
    "Add empty-state illustrations, currently just text.",
  ],
  "Meeting Note": [
    "Kickoff call: confirmed scope, they want the MVP before their trade show. No SSO for v1.",
    "Weekly sync: happy with the dashboard, asked to move 'exports' up the priority list.",
    "Demo went well. One change request: group the metrics by region.",
    "Scoping call: they overestimated the integration work; trimmed two endpoints from v1.",
    "Retro: launch slipped a week on their side (content), not ours. No hard feelings.",
  ],
  Note: [
    "Their prod is on an ancient Node 14 box - factor an upgrade into the estimate later.",
    "Handy: their API returns dates as unix seconds, not millis. Bit me once already.",
    "Client is very responsive on email, slow on Slack. Default to email.",
    "Stakeholder actually cares about Lighthouse scores - keep the bundle lean.",
    "Reminder: invoice on milestone completion, not monthly, per the SoW.",
  ],
};

export function buildSeed(): SeedData {
  const rng = new SeededRandom(0x5e_ed_11);

  const clients: Client[] = CLIENTS.map((c, i) => ({
    id: `c${i + 1}`,
    name: c.name,
    industry: c.industry,
    contacts: c.contacts,
    notes: c.notes,
    createdAt: daysAgo(200 - i * 6 + rng.int(0, 3)),
  }));

  const sows: Sow[] = [];
  const logEntries: ProjectLogEntry[] = [];
  const nonCompleted: string[] = []; // sowIds of approved, non-completed projects
  let logCounter = 0;
  let approvalIndex = -1;

  SOW_SPECS.forEach((spec, i) => {
    const sowId = `s${i + 1}`;
    const clientId = `c${spec.ci + 1}`;
    const createdAt = daysAgo(spec.created);

    const sow: Sow = {
      id: sowId,
      clientId,
      title: spec.title,
      docLink: `https://docs.example.com/sow/${sowId}`,
      status: spec.status,
      createdAt,
      updatedAt: createdAt,
      decisionNote: spec.decisionNote,
    };

    if (spec.status !== "Draft") sow.sentAt = daysAgo(spec.created - rng.int(2, 6));
    if (spec.status === "Approved" || spec.status === "Rejected")
      sow.decidedAt = daysAgo(spec.created - rng.int(8, 20));

    if (spec.status === "Approved") {
      approvalIndex += 1;
      const workStatus = WORK_STATUS_BY_APPROVAL[approvalIndex] ?? "Active";
      sow.workStatus = workStatus;
      sow.description = `Delivery of the "${spec.title}" engagement scoped in ${sowId}.`;
      sow.repoUrl = `https://github.com/driven/${sowId}-${spec.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")}`;
      sow.stagingUrl = rng.chance(0.7) ? `https://${sowId}.staging.driven.tech` : undefined;
      sow.links = rng.chance(0.4) ? [{ label: "Figma", url: `https://figma.com/file/${sowId}` }] : undefined;
      sow.startedAt = sow.decidedAt ?? daysAgo(spec.created - 10);
      sow.completedAt =
        workStatus === "Completed" ? daysAgo(Math.max(3, spec.created - rng.int(60, 90))) : undefined;
      if (workStatus !== "Completed") nonCompleted.push(sowId);

      // Base log entries: no Reminders, nothing pinned - focus pins and reminders
      // are assigned below in exact counts.
      const count = rng.int(5, 9);
      const startDay = new Date(sow.startedAt).getTime();
      const spanDays = Math.max(4, Math.floor((ANCHOR - startDay) / DAY));
      for (let e = 0; e < count; e++) {
        logCounter += 1;
        const type = pickBaseType(rng, workStatus);
        const bodies = LOG_BODIES[type];
        const body = bodies[rng.int(0, bodies.length - 1)];
        const dayOffset = Math.floor((spanDays * (e + 1)) / (count + 1));
        logEntries.push({
          id: `l${logCounter}`,
          sowId,
          type,
          body,
          createdAt: daysAgo(Math.max(0, spanDays - dayOffset)),
          pinned: false,
        });
      }
    }

    sows.push(sow);
  });

  // Exactly 6 "current focus" items: pin the newest entry (as Working On, with a
  // distinct body) in the first 6 non-completed projects.
  const FOCUS_COUNT = 6;
  for (let i = 0; i < Math.min(FOCUS_COUNT, nonCompleted.length); i++) {
    const entries = logEntries.filter((e) => e.sowId === nonCompleted[i]);
    const target = entries[entries.length - 1];
    if (target) {
      target.type = "Working On";
      target.body = LOG_BODIES["Working On"][i % LOG_BODIES["Working On"].length];
      target.pinned = true;
    }
  }

  // Exactly 5 reminders: one distinct, recent reminder in the first 5 non-completed projects.
  const REMINDER_COUNT = 5;
  for (let i = 0; i < Math.min(REMINDER_COUNT, nonCompleted.length); i++) {
    logCounter += 1;
    logEntries.push({
      id: `l${logCounter}`,
      sowId: nonCompleted[i],
      type: "Reminder",
      body: LOG_BODIES.Reminder[i % LOG_BODIES.Reminder.length],
      createdAt: daysAgo(3 + i * 5 + rng.int(0, 3)),
      pinned: false,
    });
  }

  // "Last edited": most recent log entry for projects, else the decision/sent date.
  for (const sow of sows) {
    const entries = logEntries.filter((e) => e.sowId === sow.id);
    sow.updatedAt = entries.length
      ? entries.reduce((max, e) => (e.createdAt > max ? e.createdAt : max), entries[0].createdAt)
      : sow.decidedAt ?? sow.sentAt ?? sow.createdAt;
  }

  return { clients, sows, logEntries };
}

/** Log types for base seed entries (never Reminder; those are added explicitly). */
function pickBaseType(rng: SeededRandom, workStatus: WorkStatus): LogEntryType {
  if (workStatus === "On Hold" && rng.chance(0.5)) return "Pending";
  const roll = rng.float();
  if (roll < 0.3) return "Working On";
  if (roll < 0.5) return "Backlog";
  if (roll < 0.68) return "Pending";
  if (roll < 0.86) return "Meeting Note";
  return "Note";
}
