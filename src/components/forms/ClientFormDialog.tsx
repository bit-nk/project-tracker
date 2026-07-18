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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { createClient, updateClient } from "@/hooks/use-repo";
import type { Client, ClientContact } from "@/types";

const blankContact = (): ClientContact => ({ name: "", contact: "", role: "" });

export function ClientFormDialog({
  open,
  onOpenChange,
  client,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client;
}) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [notes, setNotes] = useState("");
  const [contacts, setContacts] = useState<ClientContact[]>([blankContact()]);

  useEffect(() => {
    if (!open) return;
    setName(client?.name ?? "");
    setIndustry(client?.industry ?? "");
    setNotes(client?.notes ?? "");
    setContacts(
      client?.contacts && client.contacts.length
        ? client.contacts.map((c) => ({ ...c }))
        : [blankContact()]
    );
  }, [open, client]);

  const canSave = name.trim().length > 0;

  function updateContact(i: number, patch: Partial<ClientContact>) {
    setContacts((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c))
    );
  }

  function submit() {
    if (!canSave) return;
    const cleaned = contacts.filter((c) => c.name.trim());
    const payload = {
      name,
      industry,
      notes,
      contacts: cleaned.map((c) => ({
        name: c.name.trim(),
        contact: c.contact?.trim() || undefined,
        role: c.role?.trim() || undefined,
      })),
    };
    if (client) updateClient(client.id, payload);
    else createClient(payload);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{client ? "Edit client" : "New client"}</DialogTitle>
          <DialogDescription>
            Track a client and the people you deal with there.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="client-name">Name</Label>
              <Input
                id="client-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Corp"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-industry">Industry</Label>
              <Input
                id="client-industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="e.g. Healthcare"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Contacts</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setContacts((p) => [...p, blankContact()])}
              >
                <Plus className="h-4 w-4" />
                Add contact
              </Button>
            </div>
            <div className="space-y-2">
              {contacts.map((c, i) => (
                <div
                  key={i}
                  className="grid grid-cols-1 gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
                >
                  <Input
                    value={c.name}
                    onChange={(e) => updateContact(i, { name: e.target.value })}
                    placeholder="Name"
                  />
                  <Input
                    value={c.contact ?? ""}
                    onChange={(e) =>
                      updateContact(i, { contact: e.target.value })
                    }
                    placeholder="Email / phone"
                  />
                  <Input
                    value={c.role ?? ""}
                    onChange={(e) => updateContact(i, { role: e.target.value })}
                    placeholder="Role (e.g. Billing)"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setContacts((p) =>
                        p.length > 1 ? p.filter((_, idx) => idx !== i) : [blankContact()]
                      )
                    }
                    aria-label="Remove contact"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Rows with no name are ignored. Add a role so you remember who does
              what.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-notes">Notes</Label>
            <Textarea
              id="client-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything worth remembering about working with them."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSave}>
            {client ? "Save changes" : "Create client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
