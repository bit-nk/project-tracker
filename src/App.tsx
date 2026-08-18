import { lazy, useEffect, useState, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Login } from "@/pages/Login";
import { useIsAuthed } from "@/hooks/use-auth";
import { hydrate } from "@/data/repo";

// Route-level code splitting: each page ships as its own chunk, so the initial
// load only pulls the shell + the landing route. (Pages use named exports.)
const Dashboard = lazy(() => import("@/pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const Sows = lazy(() => import("@/pages/Sows").then((m) => ({ default: m.Sows })));
const Projects = lazy(() => import("@/pages/Projects").then((m) => ({ default: m.Projects })));
const ProjectDetail = lazy(() =>
  import("@/pages/ProjectDetail").then((m) => ({ default: m.ProjectDetail }))
);
const Clients = lazy(() => import("@/pages/Clients").then((m) => ({ default: m.Clients })));
const ClientDetail = lazy(() =>
  import("@/pages/ClientDetail").then((m) => ({ default: m.ClientDetail }))
);

// React Router needs the basename WITHOUT a trailing slash (BASE_URL has one),
// otherwise nested paths under the subpath fail to match.
const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export default function App() {
  const authed = useIsAuthed();
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState(false);

  // Load the whole dataset into the cache once, after login. A 401 during load
  // clears the token in the api client, which flips `authed` back to false.
  useEffect(() => {
    if (!authed) {
      setHydrated(false);
      setError(false);
      return;
    }
    let alive = true;
    hydrate()
      .then(() => alive && setHydrated(true))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [authed]);

  if (!authed) return <Login />;
  if (error) {
    return (
      <FullScreen>
        <p>Could not load your data.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="font-medium text-primary hover:underline"
        >
          Reload
        </button>
      </FullScreen>
    );
  }
  if (!hydrated) return <FullScreen>Loading…</FullScreen>;

  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="sows" element={<Sows />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="clients" element={<Clients />} />
          <Route path="clients/:id" element={<ClientDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
