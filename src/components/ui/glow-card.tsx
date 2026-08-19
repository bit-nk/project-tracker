import * as React from "react";
import { Card } from "./card";
import { cn } from "@/lib/utils";

/**
 * A Card whose border lights up with a brand-colored glow that follows the
 * cursor on hover. Pure CSS mask + a couple of custom properties (see the
 * `.glow-card` rule in index.css). Hover-only, so it needs no motion guard.
 */
export const GlowCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, onMouseMove, ...props }, ref) => {
    function handleMove(e: React.MouseEvent<HTMLDivElement>) {
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--glow-x", `${e.clientX - r.left}px`);
      el.style.setProperty("--glow-y", `${e.clientY - r.top}px`);
      onMouseMove?.(e);
    }
    return <Card ref={ref} onMouseMove={handleMove} className={cn("glow-card", className)} {...props} />;
  }
);
GlowCard.displayName = "GlowCard";
