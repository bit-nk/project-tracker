import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FolderKanban,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { ClientContacts } from "@/components/common/ClientContacts";
import { LogTypeBadge, WorkStatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ProjectFormDialog } from "@/components/forms/ProjectFormDialog";
import { LogEntryForm } from "@/components/forms/LogEntryForm";
import {
  deleteLogEntry,
  togglePinned,
  toggleResolved,
  useClient,
  useLogEntries,
  useProject,
  useSearchLogEntries,
} from "@/hooks/use-repo";
import { formatDate, formatDateTime, formatRelative } from "@/lib/format";
import { safeHref } from "@/lib/url";
import { cn } from "@/lib/utils";
import { LOG_ENTRY_TYPES, type LogEntryType, type ProjectLogEntry } from "@/types";

export function ProjectDetail() {
  const { id } = useParams();
  const project = useProject(id);
  const client = useClient(project?.clientId);

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<LogEntryType | "all">("all");
  const [contactsOpen, setContactsOpen] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [addingLog, setAddingLog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const allEntries = useLogEntries(project?.id);
  const searched = useSearchLogEntries(project?.id, query);
  const pinned = useMemo(() => allEntries.filter((e) => e.pinned), [allEntries]);
  const timeline = useMemo(
    () => (typeFilter === "all" ? searched : searched.filter((e) => e.type === typeFilter)),
    [searched, typeFilter]
  );

  if (!project) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="Project not found"
        description="This project doesn't exist, or its SoW is no longer approved."
        action={
          <Button asChild variant="outline">
            <Link to="/projects">Back to projects</Link>
          </Button>
        }
        className="mt-10"
      />
    );
  }

  function openNewLog() {
    setEditingId(null);
    setAddingLog(true);
  }
  function openEditLog(entry: ProjectLogEntry) {
    setAddingLog(false);
    setEditingId(entry.id);
  }

  const typeFilters: (LogEntryType | "all")[] = ["all", ...LOG_ENTRY_TYPES];

  return (
    <div className="space-y-5">
      <Link
        to="/projects"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Projects
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          {client && (
            <Link
              to={`/clients/${client.id}`}
              className="text-sm font-medium text-muted-foreground hover:text-primary hover:underline"
            >
              {client.name}
            </Link>
          )}
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
            <WorkStatusBadge status={project.workStatus ?? "Active"} />
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditProjectOpen(true)}>
          <Pencil className="h-3.5 w-3.5" />
          Edit project
        </Button>
      </div>

      {/* Compact meta strip - kept small so the log is the focus */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <Meta label="Started">{formatDate(project.startedAt)}</Meta>
          {project.completedAt && <Meta label="Completed">{formatDate(project.completedAt)}</Meta>}
          <span className="h-4 w-px bg-border" />
          {project.repoUrl && <MetaLink href={project.repoUrl}>Repo</MetaLink>}
          {project.stagingUrl && <MetaLink href={project.stagingUrl}>Staging</MetaLink>}
          {project.docLink && <MetaLink href={project.docLink}>SoW doc</MetaLink>}
          {project.links?.map((l) => (
            <MetaLink key={l.url} href={l.url}>
              {l.label}
            </MetaLink>
          ))}
        </div>
        {project.description && (
          <p className="mt-2 border-t border-border pt-2 text-sm text-muted-foreground">
            {project.description}
          </p>
        )}
      </Card>

      {/* Client contacts - collapsed by default */}
      <Card className="overflow-hidden">
        <button
          type="button"
          onClick={() => setContactsOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40"
          aria-expanded={contactsOpen}
        >
          {contactsOpen ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-sm font-medium">Contacts</span>
          <span className="text-xs text-muted-foreground">
            {client?.name ?? "Client"} · {client?.contacts?.length ?? 0}
          </span>
        </button>
        {contactsOpen && client && (
          <div className="border-t border-border p-4">
            <ClientContacts clientId={client.id} />
          </div>
        )}
      </Card>

      {/* Current focus (pinned) */}
      {pinned.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-sm font-medium text-primary">
            <Pin className="h-3.5 w-3.5" />
            Current focus
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {pinned.map((e) => (
              <div key={e.id} className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="mb-1 flex items-center justify-between">
                  <LogTypeBadge type={e.type} />
                  <button
                    onClick={() => togglePinned(e.id)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Unpin"
                    title="Unpin"
                  >
                    <PinOff className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-sm">{e.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Log - the heart of the page */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            Log <span className="text-sm font-normal text-muted-foreground">{allEntries.length}</span>
          </h2>
          <Button size="sm" onClick={openNewLog}>
            <Plus className="h-4 w-4" />
            Add entry
          </Button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search this log…"
              className="pl-8"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {typeFilters.map((t) => (
            <Button
              key={t}
              size="sm"
              variant={typeFilter === t ? "default" : "outline"}
              onClick={() => setTypeFilter(t)}
            >
              {t === "all" ? "All" : t}
            </Button>
          ))}
        </div>

        {addingLog && (
          <LogEntryForm sowId={project.id} onDone={() => setAddingLog(false)} />
        )}

        {allEntries.length === 0 ? (
          !addingLog && (
            <EmptyState
              icon={Pencil}
              title="No log entries yet"
              description="Add your first note, meeting note, or reminder for this project."
              action={
                <Button size="sm" onClick={openNewLog}>
                  <Plus className="h-4 w-4" />
                  Add entry
                </Button>
              }
            />
          )
        ) : timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">No entries match.</p>
        ) : (
          <div className="space-y-2">
            {timeline.map((entry) =>
              editingId === entry.id ? (
                <LogEntryForm
                  key={entry.id}
                  sowId={project.id}
                  entry={entry}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <LogRow key={entry.id} entry={entry} onEdit={openEditLog} />
              )
            )}
          </div>
        )}
      </div>

      <ProjectFormDialog open={editProjectOpen} onOpenChange={setEditProjectOpen} project={project} />
    </div>
  );
}

function LogRow({
  entry,
  onEdit,
}: {
  entry: ProjectLogEntry;
  onEdit: (e: ProjectLogEntry) => void;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <LogTypeBadge type={entry.type} />
          <span
            className="text-xs text-muted-foreground"
            title={formatDateTime(entry.createdAt)}
          >
            {formatRelative(entry.createdAt)}
          </span>
          {entry.resolved && (
            <span className="text-xs font-medium text-muted-foreground">· Resolved</span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {entry.type === "Reminder" && (
            <IconButton
              label={entry.resolved ? "Reopen reminder" : "Resolve reminder"}
              onClick={() => toggleResolved(entry.id)}
              active={entry.resolved}
            >
              {entry.resolved ? (
                <RotateCcw className="h-3.5 w-3.5" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
            </IconButton>
          )}
          <IconButton
            label={entry.pinned ? "Unpin" : "Pin"}
            onClick={() => togglePinned(entry.id)}
            active={entry.pinned}
          >
            <Pin className={cn("h-3.5 w-3.5", entry.pinned && "fill-current")} />
          </IconButton>
          <IconButton label="Edit" onClick={() => onEdit(entry)}>
            <Pencil className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            label="Delete"
            onClick={() => {
              if (confirm("Delete this log entry?")) deleteLogEntry(entry.id);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>
      <p
        className={cn(
          "mt-2 whitespace-pre-wrap text-sm",
          entry.resolved && "text-muted-foreground line-through"
        )}
      >
        {entry.body}
      </p>
    </Card>
  );
}

function IconButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        active && "text-primary"
      )}
    >
      {children}
    </button>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </span>
  );
}

function MetaLink({ href, children }: { href: string; children: ReactNode }) {
  const safe = safeHref(href);
  if (!safe) return null; // never render a link for an unsafe/unparseable URL
  return (
    <a
      href={safe}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
