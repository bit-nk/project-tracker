// Runnable check for the non-trivial logic: the SoW status state machine.
// Every transition result must satisfy the same invariants as the DB CHECK
// constraints on `sow`. Run with: npm run selfcheck
import { strict as assert } from "node:assert";
import { transition, type SowState, type Status } from "./lib/sow-state.js";

// Mirror of the sow_* CHECK constraints — a transition that violates any of
// these would be rejected by Postgres, so it must never be produced here.
function assertValid(s: SowState, label: string) {
  const isApproved = s.status === "Approved";
  assert.equal(isApproved, s.work_status !== null, `${label}: project fields iff Approved`);
  assert.ok(isApproved ? s.started_at !== null : true, `${label}: Approved needs started_at`);
  assert.ok(s.completed_at === null || s.work_status === "Completed", `${label}: completed_at needs Completed`);
  assert.ok(s.status === "Draft" || s.sent_at !== null, `${label}: non-Draft needs sent_at`);
  const decided = s.status === "Approved" || s.status === "Rejected";
  assert.equal(decided, s.decided_at !== null, `${label}: decided_at iff Approved/Rejected`);
}

const draft: SowState = {
  status: "Draft", sent_at: null, decided_at: null, started_at: null,
  completed_at: null, work_status: null, decision_note: null,
};

const targets: Status[] = ["Draft", "Sent", "Approved", "Rejected"];

// From a fresh Draft, every target must yield a valid row.
for (const t of targets) assertValid(transition(draft, t), `Draft->${t}`);

// From every state, every target must yield a valid row (full matrix).
for (const from of targets) {
  const start = transition(draft, from);
  for (const to of targets) assertValid(transition(start, to), `${from}->${to}`);
}

// Approving with an explicit Completed work status sets completed_at.
const done = transition(draft, "Approved", undefined, "Completed");
assert.equal(done.work_status, "Completed");
assert.ok(done.completed_at !== null, "Completed approval sets completed_at");
assertValid(done, "Approved(Completed)");

// Reverting to Draft clears all decision/project fields.
const reverted = transition(done, "Draft");
assert.equal(reverted.work_status, null);
assert.equal(reverted.decided_at, null);
assert.equal(reverted.completed_at, null);
assertValid(reverted, "Approved->Draft");

console.log("selfcheck passed: SoW state machine produces constraint-valid rows for all transitions");
