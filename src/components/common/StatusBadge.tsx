import {
  AlarmClock,
  CheckCircle2,
  Clock,
  FilePen,
  Hammer,
  ListTodo,
  PauseCircle,
  Send,
  StickyNote,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { LucideIcon } from "lucide-react";
import type { LogEntryType, SowStatus, WorkStatus } from "@/types";

type Meta = { variant: BadgeProps["variant"]; icon: LucideIcon };

const SOW: Record<SowStatus, Meta> = {
  Draft: { variant: "muted", icon: FilePen },
  Sent: { variant: "warning", icon: Send },
  Approved: { variant: "success", icon: CheckCircle2 },
  Rejected: { variant: "destructive", icon: XCircle },
};

const WORK: Record<WorkStatus, Meta> = {
  Active: { variant: "default", icon: Zap },
  "On Hold": { variant: "warning", icon: PauseCircle },
  Completed: { variant: "success", icon: CheckCircle2 },
};

const LOG: Record<LogEntryType, Meta> = {
  "Working On": { variant: "default", icon: Hammer },
  Pending: { variant: "warning", icon: Clock },
  Reminder: { variant: "info", icon: AlarmClock },
  Backlog: { variant: "muted", icon: ListTodo },
  "Meeting Note": { variant: "secondary", icon: Users },
  Note: { variant: "outline", icon: StickyNote },
};

function StatusBadgeBase({
  meta,
  label,
  showIcon = true,
}: {
  meta: Meta;
  label: string;
  showIcon?: boolean;
}) {
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant}>
      {showIcon && <Icon className="h-3 w-3" />}
      {label}
    </Badge>
  );
}

export function SowStatusBadge({ status, showIcon }: { status: SowStatus; showIcon?: boolean }) {
  return <StatusBadgeBase meta={SOW[status]} label={status} showIcon={showIcon} />;
}

export function WorkStatusBadge({ status, showIcon }: { status: WorkStatus; showIcon?: boolean }) {
  return <StatusBadgeBase meta={WORK[status]} label={status} showIcon={showIcon} />;
}

export function LogTypeBadge({ type, showIcon }: { type: LogEntryType; showIcon?: boolean }) {
  return <StatusBadgeBase meta={LOG[type]} label={type} showIcon={showIcon} />;
}

/** Icon-only accessor for the log types (used in filter chips, etc). */
export function logTypeIcon(type: LogEntryType): LucideIcon {
  return LOG[type].icon;
}
