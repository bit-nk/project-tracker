import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, ExternalLink, Pencil, Plus, Users } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { ClientContacts } from "@/components/common/ClientContacts";
import { SowStatusBadge, WorkStatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SowFormDialog } from "@/components/forms/SowFormDialog";
import { updateClient, useClientHistory } from "@/hooks/use-repo";
import { formatDate } from "@/lib/format";
import type { Client } from "@/types";

export function ClientDetail() {
  const { id } = useParams();
  const data = useClientHistory(id);
  const [sowOpen, setSowOpen] = useState(false);

  if (!data) {
    return (
      <EmptyState
        icon={Users}
        title="Client not found"
        description="This client doesn't exist, or was removed."
        action={
          <Button asChild variant="outline">
            <Link to="/clients">Back to clients</Link>
          </Button>
        }
        className="mt-10"
      />
    );
  }

  const { client, sows, projects } = data;

  return (
    <div className="space-y-6">
      <Link
        to="/clients"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Clients
      </Link>

      {/* Header - name/industry edit inline */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <ClientHeaderEditor client={client} />
        <Button size="sm" onClick={() => setSowOpen(true)}>
          <Plus className="h-4 w-4" />
          New SoW
        </Button>
      </div>

      {/* Contacts - add / edit / remove inline */}
      <SectionCard title="Contacts" count={client.contacts?.length ?? 0}>
        <ClientContacts clientId={client.id} />
      </SectionCard>

      {/* Notes - edit inline */}
      <NotesSection client={client} />

      {/* Statements of Work */}
      <SectionCard title="Statements of Work" count={sows.length}>
        {sows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No SoWs yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {sows.map((sow) => (
              <div
                key={sow.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 first:pt-0"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-normal">{sow.title}</span>
                <SowStatusBadge status={sow.status} />
                <span className="text-xs text-muted-foreground">{formatDate(sow.createdAt)}</span>
                {sow.docLink && (
                  <a
                    href={sow.docLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    Doc
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {sow.status === "Approved" && (
                  <Link
                    to={`/projects/${sow.id}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Project
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Projects */}
      <SectionCard title="Projects" count={projects.length}>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {projects.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 first:pt-0"
              >
                <Link
                  to={`/projects/${p.id}`}
                  className="min-w-0 flex-1 truncate text-sm font-normal hover:text-primary hover:underline"
                >
                  {p.title}
                </Link>
                <WorkStatusBadge status={p.workStatus ?? "Active"} />
                <span className="text-xs text-muted-foreground">{formatDate(p.startedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SowFormDialog open={sowOpen} onOpenChange={setSowOpen} defaultClientId={client.id} />
    </div>
  );
}

function ClientHeaderEditor({ client }: { client: Client }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(client.name);
  const [industry, setIndustry] = useState(client.industry ?? "");

  function start() {
    setName(client.name);
    setIndustry(client.industry ?? "");
    setEditing(true);
  }
  function save() {
    if (!name.trim()) return;
    updateClient(client.id, { name, industry });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="w-full max-w-md space-y-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Client name" autoFocus />
        <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Industry" />
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={!name.trim()}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
        <p className="text-sm text-muted-foreground">{client.industry || "No industry"}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground"
        aria-label="Edit client"
        onClick={start}
      >
        <Pencil className="h-4 w-4" />
      </Button>
    </div>
  );
}

function NotesSection({ client }: { client: Client }) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(client.notes ?? "");

  function start() {
    setNotes(client.notes ?? "");
    setEditing(true);
  }
  function save() {
    updateClient(client.id, { notes });
    setEditing(false);
  }

  return (
    <SectionCard
      title="Notes"
      action={
        !editing && (
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            aria-label="Edit notes"
            onClick={start}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )
      }
    >
      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything worth remembering about working with them."
            className="min-h-[90px] resize-y"
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={save}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : client.notes ? (
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{client.notes}</p>
      ) : (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      )}
    </SectionCard>
  );
}

function SectionCard({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold tracking-tight">{title}</h2>
          <div className="flex items-center gap-2">
            {count != null && (
              <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
            )}
            {action}
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
