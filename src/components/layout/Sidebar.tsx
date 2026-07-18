import { NavLink } from "react-router-dom";
import {
  FileText,
  FolderKanban,
  LayoutDashboard,
  Moon,
  Sun,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/use-theme";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/sows", label: "SoWs", icon: FileText },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/clients", label: "Clients", icon: Users },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <Compass />
      </span>
      <div className="leading-tight">
        <div className="text-base font-semibold tracking-tight">Helm</div>
        <div className="text-[11px] text-muted-foreground">
          SoW &amp; Project Tracker
        </div>
      </div>
    </div>
  );
}

// Small inline compass mark (matches the favicon vibe) so we don't ship an asset.
function Compass() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M12 12 16.5 7.5 13.5 13.5 7.5 16.5 10.5 10.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {NAV.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )
            }
          >
            <Icon className="h-[18px] w-[18px]" />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

function SidebarFooter() {
  const { theme, toggleTheme } = useTheme();
  const Icon = theme === "dark" ? Sun : Moon;
  return (
    <div className="flex items-center justify-between gap-2 px-3 pb-4 pt-2">
      <button
        type="button"
        onClick={toggleTheme}
        aria-label="Toggle theme"
        className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
      >
        <Icon className="h-[18px] w-[18px]" />
        {theme === "dark" ? "Light mode" : "Dark mode"}
      </button>
      <span className="px-1 text-[11px] text-muted-foreground">v0.1</span>
    </div>
  );
}

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {/* Desktop: fixed rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-16 items-center">
          <Brand />
        </div>
        <NavItems />
        <SidebarFooter />
      </aside>

      {/* Mobile: slide-over drawer. Only mounted when open so its links are
          never in the tab order (and never inside an aria-hidden region) while
          closed. */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 animate-in fade-in-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 animate-in slide-in-from-left duration-200 flex-col border-r border-sidebar-border bg-sidebar">
            <div className="flex h-16 items-center justify-between pr-3">
              <Brand />
              <button
                onClick={onClose}
                className="rounded-md p-2 text-muted-foreground hover:bg-muted"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavItems onNavigate={onClose} />
            <SidebarFooter />
          </aside>
        </div>
      )}
    </>
  );
}
