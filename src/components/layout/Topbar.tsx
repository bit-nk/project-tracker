import { Menu } from "lucide-react";

/**
 * Mobile-only top bar: just the button to open the sidebar drawer. On desktop
 * the sidebar is always visible, so there's no top bar (theme toggle lives at
 * the bottom of the sidebar).
 */
export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur md:hidden">
      <button
        onClick={onOpenMenu}
        className="rounded-md p-2 text-muted-foreground hover:bg-muted"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>
    </header>
  );
}
