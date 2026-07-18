import { ArrowDownUp } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SortOption } from "@/hooks/use-repo";

const OPTIONS: { value: SortOption; label: string }[] = [
  { value: "edited-desc", label: "Date edited (newest)" },
  { value: "edited-asc", label: "Date edited (oldest)" },
  { value: "added-desc", label: "Date added (newest)" },
  { value: "added-asc", label: "Date added (oldest)" },
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "name-desc", label: "Name (Z-A)" },
];

export function SortSelect({
  value,
  onChange,
}: {
  value: SortOption;
  onChange: (value: SortOption) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SortOption)}>
      <SelectTrigger className="h-9 w-[200px] text-xs" aria-label="Sort by">
        {/* A <div> (not <span>) so the trigger's [&>span]:line-clamp rule doesn't
            turn this into a vertical box and stack the icon above the text. */}
        <div className="flex min-w-0 items-center gap-2">
          <ArrowDownUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <SelectValue />
        </div>
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
