import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronRight,
  ExternalLink,
  FolderKanban,
  Pin,
  Plus,
  Search,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { WorkStatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NewProjectDialog } from "@/components/forms/NewProjectDialog";
import { SortSelect } from "@/components/common/SortSelect";
import { sortSows, useClients, usePinnedEntries, useProjects } from "@/hooks/use-repo";
import type { SortOption } from "@/hooks/use-repo";
import { formatDate } from "@/lib/format";
import { WORK_STATUSES, type Sow, type WorkStatus } from "@/types";

export function Projects() {
  const navigate = useNavigate();
  const clients = useClients();
  const allProjects = useProjects();
  const [workFilter, setWorkFilter] = useState<WorkStatus | "all">("all");
  const [sort, setSort] = useState<SortOption>("edited-desc");
  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const projects = useProjects(workFilter === "all" ? undefined : { workStatus: workFilter });

  const clientNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clients) m.set(c.id, c.name);
    return m;
  }, [clients]);

  const visible = useMemo(() => {
    const sorted = sortSows(projects, sort);
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (clientNames.get(p.clientId)?.toLowerCase().includes(q) ?? false)
    );
  }, [projects, sort, query, clientNames]);

  const filters: (WorkStatus | "all")[] = ["all", ...WORK_STATUSES];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Where the delivery work lives. A project is an approved SoW - or start one directly."
        actions={
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" />
            New project
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
              placeholder="Search projects or clients…"
              className="pl-8"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((f) => (
              <Button
                key={f}
                size="sm"
                variant={workFilter === f ? "default" : "outline"}
                onClick={() => setWorkFilter(f)}
              >
                {f === "all" ? "All" : f}
              </Button>
            ))}
          </div>
        </div>
        <SortSelect value={sort} onChange={setSort} />
      </div>

      {allProjects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Start a project directly, or approve a SoW and it shows up here."
          action={
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" />
              New project
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No projects match.</p>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {visible.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              clientName={clientNames.get(project.clientId) ?? "Unknown client"}
            />
          ))}
        </Card>
      )}

      <NewProjectDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(p) => navigate(`/projects/${p.id}`)}
      />
    </div>
  );
}

function ProjectRow({ project, clientName }: { project: Sow; clientName: string }) {
  const navigate = useNavigate();
  const pinned = usePinnedEntries(project.id);
  const path = `/projects/${project.id}`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(path)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(path);
        }
      }}
      className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="text-xs text-muted-foreground">{clientName}</div>
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{project.title}</span>
          <WorkStatusBadge status={project.workStatus ?? "Active"} />
        </div>
        {pinned.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Pin className="h-3 w-3 shrink-0" />
            <span className="truncate">{pinned[0].body}</span>
            {pinned.length > 1 && (
              <span className="shrink-0 text-muted-foreground/80">+{pinned.length - 1}</span>
            )}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-4">
        {project.repoUrl && <RepoLink href={project.repoUrl}>Repo</RepoLink>}
        {project.stagingUrl && <RepoLink href={project.stagingUrl}>Staging</RepoLink>}
        <span className="text-sm tabular-nums text-muted-foreground">
          {formatDate(project.startedAt)}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
    </div>
  );
}

function RepoLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="hidden items-center gap-1 text-xs text-muted-foreground hover:text-primary sm:flex"
    >
      <ExternalLink className="h-3 w-3" />
      {children}
    </a>
  );
}
