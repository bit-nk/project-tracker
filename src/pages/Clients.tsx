import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, FileText, FolderKanban, Pencil, Plus, Search, Users } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClientFormDialog } from "@/components/forms/ClientFormDialog";
import { updateClient, useClients, useProjects, useSows } from "@/hooks/use-repo";
import type { Client } from "@/types";

export function Clients() {
  const clients = useClients();
  const sows = useSows();
  const projects = useProjects();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.industry?.toLowerCase().includes(q) ?? false)
    );
  }, [clients, query]);

  // Count SoWs and projects per client ONCE from the flat lists (no per-row hooks).
  const sowCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sows) m.set(s.clientId, (m.get(s.clientId) ?? 0) + 1);
    return m;
  }, [sows]);

  const projectCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of projects) m.set(p.clientId, (m.get(p.clientId) ?? 0) + 1);
    return m;
  }, [projects]);

  function openCreate() {
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        description="Everyone you work with, and the history you have with them."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New client
          </Button>
        }
      />

      {clients.length > 0 && (
        <div className="relative sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients…"
            className="pl-8"
          />
        </div>
      )}

      {clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No clients yet"
          description="Add your first client to start tracking SoWs and projects against them."
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              New client
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No clients match.</p>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {filtered.map((c) => (
            <ClientRow
              key={c.id}
              client={c}
              sowCount={sowCounts.get(c.id) ?? 0}
              projectCount={projectCounts.get(c.id) ?? 0}
            />
          ))}
        </Card>
      )}

      {/* Dialog is used only for creating a new client; editing is inline. */}
      <ClientFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function ClientRow({
  client,
  sowCount,
  projectCount,
}: {
  client: Client;
  sowCount: number;
  projectCount: number;
}) {
  const navigate = useNavigate();
  const go = () => navigate(`/clients/${client.id}`);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(client.name);

  function save() {
    if (!name.trim()) return;
    updateClient(client.id, { name });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-4 py-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          className="max-w-sm"
          autoFocus
        />
        <Button size="sm" onClick={save} disabled={!name.trim()}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      }}
      className="flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{client.name}</div>
        {client.industry && (
          <div className="truncate text-sm text-muted-foreground">
            {client.industry}
          </div>
        )}
        {client.notes && (
          <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
            {client.notes}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-4 text-sm text-muted-foreground">
        <span
          className="flex items-center gap-1.5"
          title={`${client.contacts?.length ?? 0} contacts`}
        >
          <Users className="h-4 w-4" />
          <span className="tabular-nums">{client.contacts?.length ?? 0}</span>
        </span>
        <span className="flex items-center gap-1.5" title={`${sowCount} SoWs`}>
          <FileText className="h-4 w-4" />
          <span className="tabular-nums">{sowCount}</span>
        </span>
        <span
          className="flex items-center gap-1.5"
          title={`${projectCount} projects`}
        >
          <FolderKanban className="h-4 w-4" />
          <span className="tabular-nums">{projectCount}</span>
        </span>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 text-muted-foreground"
        aria-label={`Edit ${client.name}`}
        onClick={(e) => {
          e.stopPropagation();
          setName(client.name);
          setEditing(true);
        }}
      >
        <Pencil className="h-4 w-4" />
      </Button>

      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </div>
  );
}
