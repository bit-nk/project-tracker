import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateClient, useClient } from "@/hooks/use-repo";
import { safeMailto } from "@/lib/url";
import type { ClientContact } from "@/types";

/**
 * A client's contacts with fully inline editing: add, edit, and remove each
 * contact in place (no popup). Reused on the Client and Project pages so the UI
 * is identical.
 */
export function ClientContacts({ clientId }: { clientId: string }) {
  const client = useClient(clientId);
  const [adding, setAdding] = useState(false);

  const contacts = client?.contacts ?? [];

  function saveContact(index: number, updated: ClientContact) {
    if (!client) return;
    const next = contacts.map((c, i) => (i === index ? updated : c));
    updateClient(client.id, { contacts: next });
  }
  function removeContact(index: number) {
    if (!client) return;
    updateClient(client.id, { contacts: contacts.filter((_, i) => i !== index) });
  }
  function addContact(added: ClientContact) {
    if (!client) return;
    updateClient(client.id, { contacts: [...contacts, added] });
    setAdding(false);
  }

  return (
    <div className="space-y-3">
      {contacts.length > 0 ? (
        <div className="divide-y divide-border">
          {contacts.map((c, i) => (
            <ContactRow
              key={i}
              contact={c}
              onSave={(updated) => saveContact(i, updated)}
              onRemove={() => removeContact(i)}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No contacts yet.</p>
      )}

      {adding ? (
        <div className="border-t border-border pt-3">
          <ContactFields onSave={addContact} onCancel={() => setAdding(false)} submitLabel="Add" />
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" />
          Add contact
        </Button>
      )}
    </div>
  );
}

function ContactRow({
  contact,
  onSave,
  onRemove,
}: {
  contact: ClientContact;
  onSave: (c: ClientContact) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="py-2 first:pt-0">
        <ContactFields
          initial={contact}
          submitLabel="Save"
          onSave={(c) => {
            onSave(c);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 first:pt-0">
      <span className="text-sm font-medium">{contact.name}</span>
      {contact.role && <span className="text-sm text-muted-foreground">{contact.role}</span>}
      {contact.contact &&
        (safeMailto(contact.contact) ? (
          <a href={safeMailto(contact.contact)} className="text-sm text-primary hover:underline">
            {contact.contact}
          </a>
        ) : (
          <span className="text-sm text-muted-foreground">{contact.contact}</span>
        ))}
      <div className="ml-auto flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${contact.name}`}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${contact.name}`}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** The three contact inputs + Save/Cancel; used for both add and edit. */
function ContactFields({
  initial,
  submitLabel,
  onSave,
  onCancel,
}: {
  initial?: ClientContact;
  submitLabel: string;
  onSave: (c: ClientContact) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [contact, setContact] = useState(initial?.contact ?? "");
  const [role, setRole] = useState(initial?.role ?? "");
  const canSave = name.trim().length > 0;

  function save() {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      contact: contact.trim() || undefined,
      role: role.trim() || undefined,
    });
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="Name"
          autoFocus
        />
        <Input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="Email / phone"
        />
        <Input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="Role (e.g. Billing)"
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={!canSave}>
          {submitLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
