import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlarmClock,
  ArrowRight,
  Check,
  FileText,
  Percent,
  PinOff,
  Plus,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { LogTypeBadge } from "@/components/common/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import {
  addLogEntry,
  toggleResolved,
  togglePinned,
  useClients,
  useFocusItems,
  useProjects,
  useReminders,
  useStats,
} from "@/hooks/use-repo";
import type { FocusItem, ReminderItem } from "@/hooks/use-repo";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Dashboard() {
  const stats = useStats();
  const focus = useFocusItems();
  const reminders = useReminders();
  const [addReminder, setAddReminder] = useState(false);
  const [addFocus, setAddFocus] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="What you're working on right now, across every active project."
      />

      {/* Compact top strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat
          icon={FileText}
          label="Total SoWs"
          value={stats.sow.total}
          sub={`${stats.sow.byStatus.Draft} draft · ${stats.sow.approved} approved`}
        />
        <MiniStat
          icon={Percent}
          label="Conversion"
          value={`${Math.round(stats.sow.conversionRate * 100)}%`}
          sub={`${stats.sow.approved} of ${stats.sow.decided} decided`}
        />
        <ProjectsByStatus
          active={stats.project.active}
          onHold={stats.project.onHold}
          completed={stats.project.completed}
        />
      </div>

      {/* Reminders */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <AlarmClock className="h-4 w-4 text-sky-500" />
          <h2 className="text-lg font-semibold tracking-tight">Reminders</h2>
          <span className="text-sm text-muted-foreground">{reminders.length}</span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setAddReminder((v) => !v)}
          >
            <Plus className="h-4 w-4" />
            Add reminder
          </Button>
        </div>

        {addReminder && <AddLogItemForm kind="reminder" onClose={() => setAddReminder(false)} />}

        {reminders.length === 0 ? (
          !addReminder && (
            <p className="text-sm text-muted-foreground">No reminders right now.</p>
          )
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {reminders.slice(0, 6).map((item) => (
                <ReminderCard key={item.entry.id} item={item} />
              ))}
            </div>
            {reminders.length > 6 && (
              <p className="mt-2 text-xs text-muted-foreground">
                +{reminders.length - 6} more reminders in your projects
              </p>
            )}
          </>
        )}
      </section>

      {/* Current focus */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold tracking-tight">Current focus</h2>
          <span className="text-sm text-muted-foreground">{focus.length}</span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setAddFocus((v) => !v)}>
              <Plus className="h-4 w-4" />
              Add focus
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/projects">
                All projects
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        {addFocus && <AddLogItemForm kind="focus" onClose={() => setAddFocus(false)} />}

        {focus.length === 0 ? (
          !addFocus && (
            <p className="text-sm text-muted-foreground">
              Nothing pinned. Pin a log entry in any project to keep it in view here.
            </p>
          )
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {focus.map((item) => (
              <FocusCard key={item.entry.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

function ProjectsByStatus({
  active,
  onHold,
  completed,
}: {
  active: number;
  onHold: number;
  completed: number;
}) {
  const rows = [
    { label: "Active", n: active, dot: "bg-sky-500" },
    { label: "On Hold", n: onHold, dot: "bg-amber-500" },
    { label: "Completed", n: completed, dot: "bg-emerald-500" },
  ];
  return (
    <Card className="p-4 sm:col-span-2">
      <div className="mb-2 text-xs font-medium text-muted-foreground">Projects by status</div>
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 rounded-full", r.dot)} />
            <span className="text-sm text-muted-foreground">{r.label}</span>
            <span className="text-sm font-semibold tabular-nums">{r.n}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Inline (non-popup) add form for a reminder or a current-focus log item. */
function AddLogItemForm({
  kind,
  onClose,
}: {
  kind: "reminder" | "focus";
  onClose: () => void;
}) {
  const clients = useClients();
  const projects = useProjects();
  const options = projects
    .filter((p) => (p.workStatus ?? "Active") !== "Completed")
    .map((p) => ({
      value: p.id,
      label: `${clients.find((c) => c.id === p.clientId)?.name ?? "Unknown"} - ${p.title}`,
    }));
  const [projectId, setProjectId] = useState(options[0]?.value ?? "");
  const [note, setNote] = useState("");
  const canAdd = projectId && note.trim().length > 0;

  function add() {
    if (!canAdd) return;
    addLogEntry(projectId, {
      type: kind === "reminder" ? "Reminder" : "Working On",
      body: note.trim(),
      pinned: kind === "focus",
    });
    setNote("");
    onClose();
  }

  return (
    <Card className="mb-4 p-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label>Project</Label>
          <Combobox
            value={projectId}
            onChange={setProjectId}
            options={options}
            placeholder="Select a project"
            searchPlaceholder="Search projects…"
            emptyText="No active projects."
          />
        </div>
        <div className="space-y-1.5">
          <Label>{kind === "reminder" ? "Reminder" : "Focus note"}</Label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder={
              kind === "reminder" ? "What to remember…" : "What you're focusing on…"
            }
            autoFocus
          />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={add} disabled={!canAdd}>
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
      {options.length === 0 && (
        <p className="mt-2 text-xs text-warning">
          No active projects yet - create one first.
        </p>
      )}
    </Card>
  );
}

/** Shared clickable shell for the focus/reminder cards. */
function HomeCard({
  path,
  client,
  projectTitle,
  action,
  children,
}: {
  path: string;
  client: string;
  projectTitle: string;
  action: { label: string; icon: LucideIcon; onClick: () => void };
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const ActionIcon = action.icon;
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => navigate(path)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(path);
        }
      }}
      className="cursor-pointer transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs text-muted-foreground">{client}</div>
            <div className="truncate text-sm font-medium">{projectTitle}</div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              action.onClick();
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ActionIcon className="h-3.5 w-3.5" />
            {action.label}
          </button>
        </div>
        {/* Divider, not a nested card: the body sits on the card surface. */}
        <div className="mt-3 border-t border-border pt-3">{children}</div>
      </CardContent>
    </Card>
  );
}

function FocusCard({ item }: { item: FocusItem }) {
  const { entry, project, client } = item;
  return (
    <HomeCard
      path={`/projects/${project.id}`}
      client={client?.name ?? "Unknown client"}
      projectTitle={project.title}
      action={{ label: "Remove", icon: PinOff, onClick: () => togglePinned(entry.id) }}
    >
      <div className="mb-1.5">
        <LogTypeBadge type={entry.type} />
      </div>
      <p className="line-clamp-3 text-sm text-foreground/90">{entry.body}</p>
    </HomeCard>
  );
}

function ReminderCard({ item }: { item: ReminderItem }) {
  const { entry, project, client } = item;
  return (
    <HomeCard
      path={`/projects/${project.id}`}
      client={client?.name ?? "Unknown client"}
      projectTitle={project.title}
      action={{ label: "Resolve", icon: Check, onClick: () => toggleResolved(entry.id) }}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-sky-600 dark:text-sky-400">
        <AlarmClock className="h-3.5 w-3.5" />
        Reminder
        <span className="font-normal text-muted-foreground">
          · {formatRelative(entry.createdAt)}
        </span>
      </div>
      <p className="line-clamp-3 text-sm text-foreground/90">{entry.body}</p>
    </HomeCard>
  );
}
