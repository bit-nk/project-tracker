import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { updateProject } from "@/hooks/use-repo";
import {
  WORK_STATUSES,
  type ProjectLink,
  type Sow,
  type WorkStatus,
} from "@/types";

const blankLink = (): ProjectLink => ({ label: "", url: "" });

/** Edits the project (work) fields of an Approved SoW. */
export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Sow | undefined;
}) {
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<WorkStatus>("Active");
  const [repoUrl, setRepoUrl] = useState("");
  const [stagingUrl, setStagingUrl] = useState("");
  const [links, setLinks] = useState<ProjectLink[]>([]);

  useEffect(() => {
    if (!open || !project) return;
    setDescription(project.description ?? "");
    setStatus(project.workStatus ?? "Active");
    setRepoUrl(project.repoUrl ?? "");
    setStagingUrl(project.stagingUrl ?? "");
    setLinks(project.links?.map((l) => ({ ...l })) ?? []);
  }, [open, project]);

  function updateLink(i: number, patch: Partial<ProjectLink>) {
    setLinks((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function submit() {
    if (!project) return;
    updateProject(project.id, {
      description,
      workStatus: status,
      repoUrl,
      stagingUrl,
      links: links.filter((l) => l.label.trim() && l.url.trim()),
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription>
            {project ? project.title : "Project"} - work status, links and metadata.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="proj-work">Work status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as WorkStatus)}>
              <SelectTrigger id="proj-work" className="sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORK_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="proj-desc">Description</Label>
            <Textarea
              id="proj-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="proj-repo">Repo URL</Label>
              <Input
                id="proj-repo"
                type="url"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-staging">Staging URL</Label>
              <Input
                id="proj-staging"
                type="url"
                value={stagingUrl}
                onChange={(e) => setStagingUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Extra links</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setLinks((p) => [...p, blankLink()])}
              >
                <Plus className="h-4 w-4" />
                Add link
              </Button>
            </div>
            {links.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_1.5fr_auto] gap-2">
                <Input
                  value={l.label}
                  onChange={(e) => updateLink(i, { label: e.target.value })}
                  placeholder="Label (e.g. Figma)"
                />
                <Input
                  value={l.url}
                  onChange={(e) => updateLink(i, { url: e.target.value })}
                  placeholder="https://…"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setLinks((p) => p.filter((_, idx) => idx !== i))}
                  aria-label="Remove link"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
