import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  FileText,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Moon,
  Sun,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/use-theme";
import { logout } from "@/data/auth";
import { clearCache } from "@/data/repo";

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
        <div className="text-[11px] text-muted-foreground">SoW &amp; Project Tracker</div>
      </div>
    </div>
  );
}

// Small inline compass mark (matches the favicon vibe) so we don't ship an asset.
function Compass() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 12 16.5 7.5 13.5 13.5 7.5 16.5 10.5 10.5Z" fill="currentColor" />
    </svg>
  );
}

/**
 * Nav with a single accent line that slides to the active item (measured from
 * the link NavLink marks with aria-current). `stagger` cascades the items in/out
 * for the mobile drawer, driven by `visible`.
 */
function NavItems({
  onNavigate,
  stagger = false,
  visible = true,
}: {
  onNavigate?: () => void;
  stagger?: boolean;
  visible?: boolean;
}) {
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const [line, setLine] = useState<{ top: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    setLine(active ? { top: active.offsetTop, height: active.offsetHeight } : null);
  }, [pathname]);

  return (
    <nav ref={navRef} className="relative flex flex-1 flex-col gap-1 px-3">
      <span
        aria-hidden
        className="pointer-events-none absolute left-1.5 w-0.5 rounded-full bg-primary transition-all duration-300 ease-out"
        style={{
          top: (line?.top ?? 0) + 7,
          height: Math.max(0, (line?.height ?? 0) - 14),
          opacity: line ? 1 : 0,
        }}
      />
      {NAV.map((item, i) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            style={stagger ? { transitionDelay: `${i * 55}ms` } : undefined}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                stagger ? "transition-all duration-300" : "transition-colors",
                stagger && !visible && "-translate-x-3 opacity-0",
                isActive
                  ? "text-sidebar-accent-foreground"
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
  async function handleLogout() {
    await logout();
    clearCache();
  }
  return (
    <div className="flex items-center justify-between gap-1 px-3 pb-4 pt-2">
      <button
        type="button"
        onClick={toggleTheme}
        aria-label="Toggle theme"
        className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
      >
        <Icon className="h-[18px] w-[18px]" />
        {theme === "dark" ? "Light mode" : "Dark mode"}
      </button>
      <button
        type="button"
        onClick={handleLogout}
        className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
      >
        <LogOut className="h-[18px] w-[18px]" />
        Log out
      </button>
    </div>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Keep the drawer mounted through its exit animation: `render` controls the DOM,
  // `visible` drives the enter/leave transitions.
  const [render, setRender] = useState(open);
  const [visible, setVisible] = useState(open);
  useEffect(() => {
    if (open) {
      setRender(true);
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const t = setTimeout(() => setRender(false), 320);
    return () => clearTimeout(t);
  }, [open]);

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

      {/* Mobile: slide-over drawer with a staggered menu reveal. */}
      {render && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className={cn(
              "absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300",
              visible ? "opacity-100" : "opacity-0"
            )}
            onClick={onClose}
          />
          <aside
            className={cn(
              "absolute inset-y-0 left-0 flex w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-300 ease-out",
              visible ? "translate-x-0" : "-translate-x-full"
            )}
          >
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
            <NavItems onNavigate={onClose} stagger visible={visible} />
            <SidebarFooter />
          </aside>
        </div>
      )}
    </>
  );
}
