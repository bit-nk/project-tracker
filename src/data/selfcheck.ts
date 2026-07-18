/**
 * Runnable self-check for the data layer (the non-trivial logic in this repo).
 * No test framework - plain asserts. Run with: `npm run check:data`.
 * Exits non-zero if any invariant breaks. Delete/replace when the real backend
 * lands and this in-memory logic goes away.
 */
import { mulberry32 } from "@/lib/rng";
import {
  addLogEntry,
  createSow,
  deleteSow,
  getFocusItems,
  getProject,
  getReminders,
  getSow,
  getStats,
  listClients,
  listLogEntries,
  listProjects,
  listSows,
  resetDemo,
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

// 2) Stats math matches a manual recompute; projects === Approved SoWs.
{
  const sows = listSows();
  const approved = sows.filter((s) => s.status === "Approved");
  const rejected = sows.filter((s) => s.status === "Rejected").length;
  const sent = sows.filter((s) => s.status === "Sent");
  const st = getStats();
  assert(st.sow.total === sows.length, "stats.total must equal SoW count");
  assert(st.sow.approved === approved.length, "stats.approved mismatch");
  assert(st.sow.decided === approved.length + rejected, "stats.decided mismatch");
  assert(
    Math.abs(st.sow.conversionRate - approved.length / (approved.length + rejected)) < 1e-9,
    "stats.conversionRate mismatch"
  );
  assert(st.sow.awaitingDecision === sent.length, "stats.awaitingDecision mismatch");
  assert(st.project.total === approved.length, "project total must equal Approved count");
  assert(
    st.project.active + st.project.onHold + st.project.completed === st.project.total,
    "project status counts must sum to total"
  );
  assert(
    listProjects().every((p) => p.status === "Approved"),
    "listProjects must return only Approved SoWs"
  );
  assert(getReminders().length === 5, "seed has exactly 5 reminders");
  assert(getFocusItems().length === 6, "seed has exactly 6 focus items");
  assert(listSows().every((s) => !!s.updatedAt), "every SoW has an updatedAt");
}

// 3) Multiple pins are allowed and independent.
{
  const proj = listProjects().find((p) => listLogEntries(p.id).length >= 3);
  assert(!!proj, "need a project with >=3 log entries for pin test");
  if (proj) {
    const entries = listLogEntries(proj.id);
    const before = entries.filter((e) => e.pinned).length;
    const unpinned = entries.filter((e) => !e.pinned).slice(0, 2);
    unpinned.forEach((e) => togglePinned(e.id));
    const after = listLogEntries(proj.id).filter((e) => e.pinned).length;
    assert(after === before + unpinned.length, "togglePinned must allow multiple pins");
    unpinned.forEach((e) => togglePinned(e.id)); // restore
    assert(
      listLogEntries(proj.id).filter((e) => e.pinned).length === before,
      "togglePinned must toggle back off"
    );
  }
}

// 4) Status transitions + auto-promotion to project on Approve.
{
  resetDemo();
  const clientId = listClients()[0].id;
  const s = createSow({ clientId, title: "Self-check SoW", status: "Draft" });
  assert(!s.sentAt && !s.decidedAt, "Draft SoW has no sent/decided timestamps");
  assert(getProject(s.id) === undefined, "a Draft SoW is not a project");
  updateSow(s.id, { status: "Sent" });
  assert(!!getSow(s.id)!.sentAt && !getSow(s.id)!.decidedAt, "Sent stamps sentAt only");
  updateSow(s.id, { status: "Approved" });
  const approvedSow = getSow(s.id)!;
  assert(!!approvedSow.decidedAt && !!approvedSow.sentAt, "Approved stamps both timestamps");
  assert(approvedSow.workStatus === "Active", "Approve promotes to project (workStatus Active)");
  assert(!!approvedSow.startedAt, "Approve sets startedAt");
  assert(getProject(s.id)?.id === s.id, "getProject returns the approved SoW");
  assert(
    listProjects({ clientId }).some((p) => p.id === s.id),
    "approved SoW appears under its client's projects"
  );
  updateSow(s.id, { status: "Draft" });
  assert(
    !getSow(s.id)!.sentAt && !getSow(s.id)!.decidedAt,
    "back to Draft clears sent/decided timestamps"
  );

  // 5) Completing a project stamps completedAt; reopening clears it.
  updateSow(s.id, { status: "Approved" });
  updateProject(s.id, { workStatus: "Completed" });
  assert(!!getSow(s.id)!.completedAt, "Completed stamps completedAt");
  updateProject(s.id, { workStatus: "Active" });
  assert(!getSow(s.id)!.completedAt, "reopening clears completedAt");

  // 7) Log entries keyed by SoW id; deleteSow cascades.
  addLogEntry(s.id, { type: "Note", body: "a" });
  addLogEntry(s.id, { type: "Working On", body: "b", pinned: true });
  assert(listLogEntries(s.id).length === 2, "log entries key off the SoW id");
  deleteSow(s.id);
  assert(getSow(s.id) === undefined, "deleteSow removes the SoW");
  assert(listLogEntries(s.id).length === 0, "deleteSow cascades to its log entries");
}

// 8) Ids are monotonic: a deleted id is never recycled.
{
  resetDemo();
  const clientId = listClients()[0].id;
  const first = createSow({ clientId, title: "temp" });
  deleteSow(first.id);
  const second = createSow({ clientId, title: "temp2" });
  assert(second.id !== first.id, "nextId must not recycle a deleted id");
}

// 9) Focus vs reminders separation + resolve.
{
  resetDemo();
  const clientId = listClients()[0].id;
  const p = createSow({ clientId, title: "Focus/Reminder check", status: "Approved" });
  const work = addLogEntry(p.id, { type: "Working On", body: "w", pinned: true });
  const rem = addLogEntry(p.id, { type: "Reminder", body: "r", pinned: true });
  const focus = getFocusItems();
  assert(focus.some((f) => f.entry.id === work.id), "focus includes pinned non-reminder");
  assert(!focus.some((f) => f.entry.id === rem.id), "focus excludes reminders");
  assert(getReminders().some((r) => r.entry.id === rem.id), "reminders includes the reminder");
  toggleResolved(rem.id);
  assert(
    !getReminders().some((r) => r.entry.id === rem.id),
    "resolved reminder drops off the reminders list"
  );
}

resetDemo(); // leave the store clean

if (failures.length) {
  console.error(`\n❌ data self-check: ${failures.length} failure(s):`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
} else {
  console.log(`✅ data self-check passed (${passed} assertions)`);
}
