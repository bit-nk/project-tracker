import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Accent = "neutral" | "primary" | "success" | "warning" | "destructive";

// Toned-down chips: soft tints, never loud blocks of colour.
const ACCENT: Record<Accent, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

export interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  accent?: Accent;
  /** default: "neutral" */
  /** Small caption under the value. */
  hint?: string;
  /** Optional trend chip, e.g. { value: "+12%", direction: "up" }. */
  trend?: { value: string; direction: "up" | "down" | "neutral" };
  className?: string;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  accent = "neutral",
  hint,
  trend,
  className,
}: StatCardProps) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          {title}
        </span>
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg",
            ACCENT[accent]
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">
          {value}
        </span>
        {trend && (
          <span
            className={cn(
              "mb-1 inline-flex items-center gap-0.5 text-xs font-medium",
              trend.direction === "up" && "text-success",
              trend.direction === "down" && "text-destructive",
              trend.direction === "neutral" && "text-muted-foreground"
            )}
          >
            {trend.direction === "up" && <ArrowUpRight className="h-3 w-3" />}
            {trend.direction === "down" && (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {trend.value}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
