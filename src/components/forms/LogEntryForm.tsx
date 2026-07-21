import { useState } from "react";
import { Pin } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { addLogEntry, updateLogEntry } from "@/hooks/use-repo";
import { LOG_ENTRY_TYPES, type LogEntryType, type ProjectLogEntry } from "@/types";

/**
 * Inline (non-popup) form to add or edit a log entry. Rendered in place of the
 * "Add entry" button, or in place of a log row while editing. The body textarea
 * is vertically resizable so you can expand it when you want.
 */
export function LogEntryForm({
  sowId,
  entry,
  defaultType,
  onDone,
}: {
  sowId: string;
  entry?: ProjectLogEntry;
  defaultType?: LogEntryType;
  onDone: () => void;
}) {
  const [type, setType] = useState<LogEntryType>(entry?.type ?? defaultType ?? "Working On");
  const [body, setBody] = useState(entry?.body ?? "");
  const [pinned, setPinned] = useState(entry?.pinned ?? false);

  const canSave = body.trim().length > 0;

  function submit() {
    if (!canSave) return;
    if (entry) updateLogEntry(entry.id, { type, body, pinned });
    else addLogEntry(sowId, { type, body, pinned });
    onDone();
  }

  return (
    <Card className="space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={type} onValueChange={(v) => setType(v as LogEntryType)}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOG_ENTRY_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          type="button"
          onClick={() => setPinned((p) => !p)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
            pinned
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-muted"
          )}
        >
          <Pin className={cn("h-3.5 w-3.5", pinned && "fill-current")} />
          {pinned ? "Pinned as focus" : "Pin as focus"}
        </button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`log-body-${entry?.id ?? "new"}`} className="sr-only">
          Body
        </Label>
        <Textarea
          id={`log-body-${entry?.id ?? "new"}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What happened / what you're doing…"
          className="min-h-[90px] resize-y"
          autoFocus
        />
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={submit} disabled={!canSave}>
          {entry ? "Save" : "Add entry"}
        </Button>
        <Button size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
