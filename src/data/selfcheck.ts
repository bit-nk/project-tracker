/**
 * Runnable self-check for the data layer (the non-trivial logic in this repo).
 * No test framework - plain asserts. Run with: `npm run check:data`.
 * Exits non-zero if any invariant breaks. The store ships empty; this check
 * builds its own data through the public API. Delete/replace when the real
 * backend lands and this in-memory logic goes away.
 */
import { mulberry32 } from "@/lib/rng";
import { safeHref, safeMailto } from "@/lib/url";
import {
  addLogEntry,
  createClient,
  createSow,
  deleteSow,
  getFocusItems,
  getProject,
  getReminders,
  getSow,
  getStats,
  listLogEntries,
  listProjects,
  resetStore,
  togglePinned,
  toggleResolved,
  updateProject,
  updateSow,
} from "@/data/repo";

let passed = 0;
const failures: string[] = [];
function assert(cond: boolean, msg: string) {
  if (cond) passed++;
  else failures.push(msg);
}

// 1) RNG determinism.
{
  const a = mulberry32(123);
  const b = mulberry32(123);
  let same = true;
  for (let i = 0; i < 200; i++) if (a() !== b()) same = false;
  assert(same, "mulberry32: same seed must produce identical sequence");
  assert(mulberry32(123)() !== mulberry32(124)(), "mulberry32: different seeds should diverge");
}

// 2) Empty store baseline (the shipped starting state).
resetStore();
{
  const st = getStats();
  assert(st.sow.total === 0 && st.project.total === 0, "empty store has zero SoWs/projects");
  assert(st.sow.conversionRate === 0, "empty store conversionRate is 0 (no divide-by-zero)");
  assert(getReminders().length === 0 && getFocusItems().length === 0, "empty store has no reminders/focus");
}

// 3) Stats math on a known dataset; projects === Approved SoWs.
resetStore();
{
  const clientId = createClient({ name: "Check Co" }).id;
  createSow({ clientId, title: "D1" }); // Draft
  createSow({ clientId, title: "D2" }); // Draft
  createSow({ clientId, title: "S1", status: "Sent" });
  createSow({ clientId, title: "R1", status: "Rejected" });
  createSow({ clientId, title: "A1", status: "Approved" }); // Active (default)
  const a2 = createSow({ clientId, title: "A2", status: "Approved" });
  const a3 = createSow({ clientId, title: "A3", status: "Approved" });
  updateProject(a2.id, { workStatus: "On Hold" });
  updateProject(a3.id, { workStatus: "Completed" });

  const st = getStats();
  assert(st.sow.total === 7, "stats.total counts every SoW");
  assert(st.sow.approved === 3, "stats.approved counts Approved");
  assert(st.sow.rejected === 1, "stats.rejected counts Rejected");
  assert(st.sow.decided === 4, "stats.decided = approved + rejected");
  assert(Math.abs(st.sow.conversionRate - 0.75) < 1e-9, "conversionRate = approved / decided");
  assert(st.sow.awaitingDecision === 1, "awaitingDecision = Sent count");
  assert(st.project.total === 3, "project total = Approved count");
  assert(
    st.project.active === 1 && st.project.onHold === 1 && st.project.completed === 1,
    "project work-status split is correct"
  );
  assert(
    listProjects().length === 3 && listProjects().every((p) => p.status === "Approved"),
    "listProjects returns exactly the Approved SoWs"
  );
  assert(listProjects({ clientId }).length === 3, "projects filter by client");
}

// 4) Status transitions + auto-promotion to project; completedAt stamp/clear.
resetStore();
{
  const clientId = createClient({ name: "Lifecycle Co" }).id;
  const s = createSow({ clientId, title: "SoW", status: "Draft" });
  assert(!s.sentAt && !s.decidedAt, "Draft SoW has no sent/decided timestamps");
  assert(getProject(s.id) === undefined, "a Draft SoW is not a project");
  updateSow(s.id, { status: "Sent" });
  assert(!!getSow(s.id)!.sentAt && !getSow(s.id)!.decidedAt, "Sent stamps sentAt only");
  updateSow(s.id, { status: "Approved" });
  const ap = getSow(s.id)!;
  assert(!!ap.sentAt && !!ap.decidedAt, "Approved stamps both timestamps");
  assert(ap.workStatus === "Active" && !!ap.startedAt, "Approve promotes to project (Active, startedAt)");
  assert(getProject(s.id)?.id === s.id, "getProject returns the approved SoW");
  updateSow(s.id, { status: "Draft" });
  assert(!getSow(s.id)!.sentAt && !getSow(s.id)!.decidedAt, "back to Draft clears sent/decided");
  updateSow(s.id, { status: "Approved" });
  updateProject(s.id, { workStatus: "Completed" });
  assert(!!getSow(s.id)!.completedAt, "Completed stamps completedAt");
  updateProject(s.id, { workStatus: "Active" });
  assert(!getSow(s.id)!.completedAt, "reopening clears completedAt");
}

// 5) Log entries: multiple pins, keyed by SoW id, cascade on delete.
resetStore();
{
  const clientId = createClient({ name: "Log Co" }).id;
  const p = createSow({ clientId, title: "Proj", status: "Approved" });
  const e1 = addLogEntry(p.id, { type: "Note", body: "a" });
  const e2 = addLogEntry(p.id, { type: "Working On", body: "b" });
  addLogEntry(p.id, { type: "Backlog", body: "c" });
  assert(listLogEntries(p.id).length === 3, "log entries key off the SoW id");
  togglePinned(e1.id);
  togglePinned(e2.id);
  assert(listLogEntries(p.id).filter((e) => e.pinned).length === 2, "togglePinned allows multiple pins");
  togglePinned(e1.id);
  assert(listLogEntries(p.id).filter((e) => e.pinned).length === 1, "togglePinned toggles back off");
  deleteSow(p.id);
  assert(
    getSow(p.id) === undefined && listLogEntries(p.id).length === 0,
    "deleteSow removes the SoW and cascades its log entries"
  );
}

// 6) Ids are monotonic: a deleted id is never recycled.
resetStore();
{
  const clientId = createClient({ name: "Id Co" }).id;
  const first = createSow({ clientId, title: "t1" });
  deleteSow(first.id);
  const second = createSow({ clientId, title: "t2" });
  assert(second.id !== first.id, "nextId must not recycle a deleted id");
}

// 7) Focus vs reminders separation + resolve.
resetStore();
{
  const clientId = createClient({ name: "Focus Co" }).id;
  const p = createSow({ clientId, title: "P", status: "Approved" });
  const work = addLogEntry(p.id, { type: "Working On", body: "w", pinned: true });
  const rem = addLogEntry(p.id, { type: "Reminder", body: "r", pinned: true });
  const focus = getFocusItems();
  assert(focus.some((f) => f.entry.id === work.id), "focus includes pinned non-reminder");
  assert(!focus.some((f) => f.entry.id === rem.id), "focus excludes reminders");
  assert(getReminders().some((r) => r.entry.id === rem.id), "reminders includes the reminder");
  toggleResolved(rem.id);
  assert(!getReminders().some((r) => r.entry.id === rem.id), "resolved reminder drops off the list");
}

// 8) URL safety helpers (XSS guard for user-entered links).
{
  assert(safeHref("https://example.com/doc") === "https://example.com/doc", "https passes");
  assert(safeHref("http://example.com") === "http://example.com/", "http passes");
  assert(safeHref("example.com/doc") === "https://example.com/doc", "bare host upgraded to https");
  // eslint-disable-next-line no-script-url
  assert(safeHref("javascript:alert(1)") === undefined, "javascript: scheme rejected");
  assert(safeHref("data:text/html,<script>x</script>") === undefined, "data: scheme rejected");
  assert(safeHref("vbscript:x") === undefined, "vbscript: scheme rejected");
  assert(safeHref(" JAVASCRIPT:alert(1)") === undefined, "case/whitespace tricks rejected");
  assert(safeHref("") === undefined && safeHref(undefined) === undefined, "empty rejected");
  assert(safeMailto("a@b.co") === "mailto:a@b.co", "plain email passes");
  assert(safeMailto("a@b.co?cc=evil@x.com") === undefined, "mailto header injection rejected");
  assert(safeMailto("not-an-email") === undefined, "non-email rejected");
}

resetStore(); // leave the store empty

if (failures.length) {
  console.error(`\n❌ data self-check: ${failures.length} failure(s):`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
} else {
  console.log(`✅ data self-check passed (${passed} assertions)`);
}
