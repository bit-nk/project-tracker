// Pure SoW status state machine — no DB/env imports so it is unit-checkable.
// A project IS an approved SoW; this computes a full field set for a target
// status that satisfies every CHECK constraint on the `sow` table.

export const STATUS = ["Draft", "Sent", "Approved", "Rejected"] as const;
export const WORK = ["Active", "On Hold", "Completed"] as const;
export type Status = (typeof STATUS)[number];
export type WorkStatus = (typeof WORK)[number];

export interface SowState {
  status: string;
  sent_at: Date | null;
  decided_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  work_status: string | null;
  decision_note: string | null;
}

export function transition(
  cur: SowState,
  target: Status,
  note?: string,
  work?: WorkStatus,
  now: Date = new Date()
): SowState {
  const sentAt = cur.sent_at ?? now;
  switch (target) {
    case "Draft":
      return { status: "Draft", sent_at: null, decided_at: null, work_status: null, started_at: null, completed_at: null, decision_note: null };
    case "Sent":
      return { status: "Sent", sent_at: sentAt, decided_at: null, work_status: null, started_at: null, completed_at: null, decision_note: cur.decision_note };
    case "Rejected":
      return { status: "Rejected", sent_at: sentAt, decided_at: now, work_status: null, started_at: null, completed_at: null, decision_note: note ?? cur.decision_note };
    case "Approved": {
      const workStatus = work ?? (cur.work_status as WorkStatus | null) ?? "Active";
      return {
        status: "Approved",
        sent_at: sentAt,
        decided_at: now,
        started_at: cur.started_at ?? now,
        work_status: workStatus,
        completed_at: workStatus === "Completed" ? cur.completed_at ?? now : null,
        decision_note: note ?? cur.decision_note,
      };
    }
  }
}
