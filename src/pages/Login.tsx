import { useState, type FormEvent } from "react";
import { login } from "@/data/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

// TEMPORARY (remove before real production): the shared test login, prefilled so
// anyone with the address can get straight in. It's one workspace — everyone who
// signs in sees the same data.
const TEST_EMAIL = "test@helm.local";
const TEST_PASSWORD = "helmtest123";

function friendly(code: string): string {
  switch (code) {
    case "invalid_credentials":
      return "Wrong email or password.";
    case "account_locked":
      return "Too many attempts. Try again in a few minutes.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export function Login() {
  const [email, setEmail] = useState(TEST_EMAIL);
  const [password, setPassword] = useState(TEST_PASSWORD);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
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
          <h1 className="text-lg font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">Welcome back.</p>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                required
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Please wait…" : "Sign in"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
