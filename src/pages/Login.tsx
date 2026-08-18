import { useState, type FormEvent } from "react";
import { login, signup } from "@/data/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

/** Map backend error codes to something a person can read. */
function friendly(code: string): string {
  switch (code) {
    case "invalid_credentials":
      return "Wrong email or password.";
    case "email_taken":
      return "That email is already registered. Try signing in.";
    case "account_locked":
      return "Too many attempts. Try again in a few minutes.";
    case "no_active_membership":
      return "This account has no workspace.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export function Login() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === "signup";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isSignup) await signup(orgName.trim(), email.trim(), password);
      else await login(email.trim(), password);
      // On success the auth store updates and App swaps to the app shell.
    } catch (err) {
      setError(friendly(err instanceof Error ? err.message : ""));
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M12 12 16.5 7.5 13.5 13.5 7.5 16.5 10.5 10.5Z" fill="currentColor" />
            </svg>
          </span>
          <div className="leading-tight">
            <div className="text-base font-semibold tracking-tight">Helm</div>
            <div className="text-[11px] text-muted-foreground">SoW &amp; Project Tracker</div>
          </div>
        </div>

        <Card className="p-6">
          <h1 className="text-lg font-semibold tracking-tight">
            {isSignup ? "Create your workspace" : "Sign in"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSignup ? "Set up a new workspace to get started." : "Welcome back."}
          </p>

          <form onSubmit={submit} className="mt-5 space-y-4">
            {isSignup && (
              <div className="space-y-1.5">
                <Label htmlFor="orgName">Workspace name</Label>
                <Input
                  id="orgName"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g. Acme Studio"
                  required
                  autoFocus
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus={!isSignup}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSignup ? "At least 10 characters" : "Your password"}
                minLength={isSignup ? 10 : undefined}
                required
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Please wait…" : isSignup ? "Create workspace" : "Sign in"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {isSignup ? "Already have a workspace?" : "No workspace yet?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(isSignup ? "login" : "signup");
                setError(null);
              }}
              className="font-medium text-primary hover:underline"
            >
              {isSignup ? "Sign in" : "Create one"}
            </button>
          </p>
        </Card>
      </div>
    </div>
  );
}
