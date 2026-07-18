import { useEffect, useMemo, useState } from "react";
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
import { createSow, updateSow, useClients } from "@/hooks/use-repo";
import { SOW_STATUSES, type Sow, type SowStatus } from "@/types";

export function SowFormDialog({
  open,
  onOpenChange,
  sow,
  defaultClientId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sow?: Sow;
  defaultClientId?: string;
  onSaved?: (sow: Sow) => void;
}) {
  const clients = useClients();
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [docLink, setDocLink] = useState("");
  const [status, setStatus] = useState<SowStatus>("Draft");
  const [decisionNote, setDecisionNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setClientId(sow?.clientId ?? defaultClientId ?? clients[0]?.id ?? "");
    setTitle(sow?.title ?? "");
    setDocLink(sow?.docLink ?? "");
    setStatus(sow?.status ?? "Draft");
    setDecisionNote(sow?.decisionNote ?? "");
  }, [open, sow, defaultClientId, clients]);

  const clientOptions = useMemo(
    () => clients.map((c) => ({ value: c.id, label: c.name })),
    [clients]
  );

  const canSave = clientId && title.trim().length > 0;
  const showDecisionNote = status === "Approved" || status === "Rejected";

  function submit() {
    if (!canSave) return;
    const payload = {
      clientId,
      title,
      docLink,
      status,
      decisionNote: showDecisionNote ? decisionNote : "",
    };
    const result = sow ? updateSow(sow.id, payload) : createSow(payload);
    onOpenChange(false);
    onSaved?.(result);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{sow ? "Edit SoW" : "New SoW"}</DialogTitle>
          <DialogDescription>
            A statement of work for a client. Approve it and it becomes a project.
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
              <p className="text-xs text-warning">Add a client first - a SoW needs one.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sow-title">Title</Label>
            <Input
              id="sow-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Customer Portal Rebuild"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as SowStatus)}>
              <SelectTrigger className="sm:w-56">
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

          <div className="space-y-1.5">
            <Label htmlFor="sow-doc">Document link</Label>
            <Input
              id="sow-doc"
              type="url"
              value={docLink}
              onChange={(e) => setDocLink(e.target.value)}
              placeholder="https://… (where you pasted the SoW doc)"
            />
          </div>

          {showDecisionNote && (
            <div className="space-y-1.5">
              <Label htmlFor="sow-note">Decision note</Label>
              <Textarea
                id="sow-note"
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder={
                  status === "Rejected"
                    ? "Why was it rejected? (helps later)"
                    : "Any notes on the approval."
                }
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSave}>
            {sow ? "Save changes" : "Create SoW"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
