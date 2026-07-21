import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  FolderKanban,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { SowStatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SowFormDialog } from "@/components/forms/SowFormDialog";
import { SortSelect } from "@/components/common/SortSelect";
import { sowComparator, updateSow, useClients, useSows } from "@/hooks/use-repo";
import type { SortOption } from "@/hooks/use-repo";
import { formatDate } from "@/lib/format";
import { safeHref } from "@/lib/url";
import { SOW_STATUSES, type Client, type Sow, type SowStatus } from "@/types";

export function Sows() {
  const clients = useClients();
  const allSows = useSows();
  const [statusFilter, setStatusFilter] = useState<SowStatus | "all">("all");
  const [sort, setSort] = useState<SortOption>("edited-desc");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);

  const q = query.trim().toLowerCase();

  const groups = useMemo(() => {
    const comparator = sowComparator(sort);
    const byClient = new Map<string, Sow[]>();
    for (const s of allSows) {
      if (statusFilter !== "all" && s.status !== statusFilter) continue;
      const client = clients.find((c) => c.id === s.clientId);
      if (q) {
        const hit =
          s.title.toLowerCase().includes(q) ||
          (client?.name.toLowerCase().includes(q) ?? false);
        if (!hit) continue;
      }
      const arr = byClient.get(s.clientId) ?? [];
      arr.push(s);
      byClient.set(s.clientId, arr);
    }
    const arr = clients
      .filter((c) => byClient.has(c.id))
      .map((c) => ({ client: c, sows: [...byClient.get(c.id)!].sort(comparator) }));
    // Order the client groups too: by name for alphabetical sorts, otherwise by
    // each group's top (already-sorted) SoW.
    if (sort === "name-asc") arr.sort((a, b) => a.client.name.localeCompare(b.client.name));
    else if (sort === "name-desc") arr.sort((a, b) => b.client.name.localeCompare(a.client.name));
    else arr.sort((a, b) => comparator(a.sows[0], b.sows[0]));
    return arr;
  }, [allSows, clients, statusFilter, q, sort]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const filters: (SowStatus | "all")[] = ["all", ...SOW_STATUSES];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Statements of Work"
        description="Grouped by client. Expand a client to see their SoWs; approve one and it becomes a project."
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" />
            New SoW
          </Button>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search SoWs or clients…"
              className="pl-8"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((f) => (
              <Button
                key={f}
                size="sm"
                variant={statusFilter === f ? "default" : "outline"}
                onClick={() => setStatusFilter(f)}
              >
                {f === "all" ? "All" : f}
              </Button>
            ))}
          </div>
        </div>
        <SortSelect value={sort} onChange={setSort} />
      </div>

      {allSows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No SoWs yet"
          description="Create your first statement of work to start tracking the pipeline."
          action={
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" />
              New SoW
            </Button>
          }
        />
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No SoWs match.</p>
      ) : (
        <div className="space-y-1.5">
          {groups.map(({ client, sows }) => (
            <ClientGroup
              key={client.id}
              client={client}
              sows={sows}
              open={q ? true : expanded.has(client.id)}
              onToggle={() => toggle(client.id)}
            />
          ))}
        </div>
      )}

      <SowFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}

function ClientGroup({
  client,
  sows,
  open,
  onToggle,
}: {
  client: Client;
  sows: Sow[];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1 text-sm font-medium">{client.name}</span>
        <span className="text-xs text-muted-foreground">
          {sows.length} {sows.length === 1 ? "SoW" : "SoWs"}
        </span>
      </button>
      {open && (
        <div className="divide-y divide-border border-t border-border">
          {sows.map((sow) => (
            <SowRow key={sow.id} sow={sow} />
          ))}
        </div>
      )}
    </Card>
  );
}

function SowRow({ sow }: { sow: Sow }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-3 py-2.5 pl-8 pr-4 text-left transition-colors hover:bg-muted/40"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-normal">{sow.title}</span>
        <SowStatusBadge status={sow.status} />
      </button>

      {expanded &&
        (editing ? (
          <SowEditForm sow={sow} onDone={() => setEditing(false)} />
        ) : (
          <div className="animate-in fade-in-0 space-y-3 pb-4 pl-10 pr-4 pt-1">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <Field label="Status">
                <SowStatusBadge status={sow.status} />
              </Field>
              <Field label="Created">{formatDate(sow.createdAt)}</Field>
              <Field label={sow.decidedAt ? "Decided" : "Sent"}>
                {formatDate(sow.decidedAt ?? sow.sentAt)}
              </Field>
            </dl>

            {sow.decisionNote && (
              <p className="rounded-md bg-muted/50 p-2.5 text-sm text-muted-foreground">
                {sow.decisionNote}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
              {safeHref(sow.docLink) && (
                <Button asChild variant="ghost" size="sm">
                  <a href={safeHref(sow.docLink)} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                    SoW document
                  </a>
                </Button>
              )}
              {sow.status === "Approved" && (
                <Button asChild variant="ghost" size="sm">
                  <Link to={`/projects/${sow.id}`}>
                    <FolderKanban className="h-3.5 w-3.5" />
                    Open project
                  </Link>
                </Button>
              )}
            </div>
          </div>
        ))}
    </div>
  );
}

/** Inline edit form (replaces the popup for editing an individual SoW). */
function SowEditForm({ sow, onDone }: { sow: Sow; onDone: () => void }) {
  const [title, setTitle] = useState(sow.title);
  const [status, setStatus] = useState<SowStatus>(sow.status);
  const [docLink, setDocLink] = useState(sow.docLink ?? "");
  const [decisionNote, setDecisionNote] = useState(sow.decisionNote ?? "");

  // Re-sync if the underlying SoW changes while the form is open.
  useEffect(() => {
    setTitle(sow.title);
    setStatus(sow.status);
    setDocLink(sow.docLink ?? "");
    setDecisionNote(sow.decisionNote ?? "");
  }, [sow]);

  const showDecisionNote = status === "Approved" || status === "Rejected";
  const canSave = title.trim().length > 0;

  function save() {
    if (!canSave) return;
    updateSow(sow.id, {
      title,
      status,
      docLink,
      decisionNote: showDecisionNote ? decisionNote : "",
    });
    onDone();
  }

  return (
    <div className="animate-in fade-in-0 space-y-3 pb-4 pl-10 pr-4 pt-1">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`title-${sow.id}`}>Title</Label>
          <Input
            id={`title-${sow.id}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as SowStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOW_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`doc-${sow.id}`}>Document link</Label>
        <Input
          id={`doc-${sow.id}`}
          type="url"
          value={docLink}
          onChange={(e) => setDocLink(e.target.value)}
          placeholder="https://…"
        />
      </div>

      {showDecisionNote && (
        <div className="space-y-1.5">
          <Label htmlFor={`note-${sow.id}`}>Decision note</Label>
          <Textarea
            id={`note-${sow.id}`}
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
            placeholder={
              status === "Rejected" ? "Why was it rejected?" : "Any notes on the approval."
            }
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={!canSave}>
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-normal">{children}</dd>
    </div>
  );
}
