import { cn } from "@/lib/utils";
import type { LogEntryType, SowStatus, WorkStatus } from "@/types";

// Every status and log type is a small dot plus its name. Color only where it
// means something (in motion, waiting, needs attention). The rest stay grey.
const NEUTRAL = "bg-muted-foreground/60";

const SOW: Record<SowStatus, string> = {
  Draft: NEUTRAL,
  Sent: "bg-warning",
  Approved: "bg-success",
  Rejected: "bg-destructive",
};

// Completed is grey, not green: primary and success are near-identical hues, and
// finished work should recede next to what is active.
export const WORK_TONE: Record<WorkStatus, string> = {
  Active: "bg-primary",
  "On Hold": "bg-warning",
  Completed: NEUTRAL,
};

const LOG: Record<LogEntryType, string> = {
  "Working On": "bg-primary",
  Pending: "bg-warning",
  Reminder: "bg-info",
  Backlog: NEUTRAL,
  "Meeting Note": NEUTRAL,
  Note: NEUTRAL,
};

export function StatusDot({ tone, className }: { tone: string; className?: string }) {
  return <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", tone, className)} />;
}

function Status({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
      <StatusDot tone={tone} />
      {label}
    </span>
  );
}

export function SowStatusBadge({ status }: { status: SowStatus }) {
  return <Status tone={SOW[status]} label={status} />;
}

export function WorkStatusBadge({ status }: { status: WorkStatus }) {
  return <Status tone={WORK_TONE[status]} label={status} />;
}

export function LogTypeBadge({ type }: { type: LogEntryType }) {
  return <Status tone={LOG[type]} label={type} />;
}
