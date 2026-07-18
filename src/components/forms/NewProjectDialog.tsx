import { useEffect, useMemo, useState } from "react";
import { FolderPlus } from "lucide-react";
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
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { createSow, updateProject, useClients } from "@/hooks/use-repo";
import { WORK_STATUSES, type Sow, type WorkStatus } from "@/types";

/**
 * Create a project directly (without first writing a SoW). Under the hood a
 * project is an Approved SoW, so this creates one and (optionally) sets its
 * work status.
 */
export function NewProjectDialog({
  open,
  onOpenChange,
  defaultClientId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultClientId?: string;
  onCreated?: (project: Sow) => void;
}) {
  const clients = useClients();
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [workStatus, setWorkStatus] = useState<WorkStatus>("Active");

  useEffect(() => {
    if (!open) return;
    setClientId(defaultClientId ?? clients[0]?.id ?? "");
    setTitle("");
    setDescription("");
    setWorkStatus("Active");
  }, [open, defaultClientId, clients]);

  const clientOptions = useMemo(
    () => clients.map((c) => ({ value: c.id, label: c.name })),
    [clients]
  );

  const canSave = clientId && title.trim().length > 0;

  function submit() {
    if (!canSave) return;
    const project = createSow({ clientId, title, status: "Approved", description });
    if (workStatus !== "Active") updateProject(project.id, { workStatus });
    onOpenChange(false);
    onCreated?.(project);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5 text-primary" />
            New project
          </DialogTitle>
          <DialogDescription>
            Start a project directly. It's recorded as an approved SoW, so it also shows
            up under that client's SoWs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Client</Label>
            <Combobox
              value={clientId}
              onChange={setClientId}
              options={clientOptions}
              placeholder="Select a client"
              searchPlaceholder="Search clients…"
              emptyText="No clients found."
            />
            {clients.length === 0 && (
              <p className="text-xs text-warning">Add a client first - a project needs one.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="np-title">Project name</Label>
            <Input
              id="np-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Internal Admin Tool"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Work status</Label>
            <Select value={workStatus} onValueChange={(v) => setWorkStatus(v as WorkStatus)}>
              <SelectTrigger className="sm:w-56">
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
            <Label htmlFor="np-desc">Description</Label>
            <Textarea
              id="np-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSave}>
            Create project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
