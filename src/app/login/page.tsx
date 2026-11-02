"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EyLogo } from "@/components/shell/ey-logo";
import { Input, Label } from "@/components/ui/input";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Sign-in failed.");
      return;
    }
    const next = params.get("next");
    router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="u">Username</Label>
        <Input id="u" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="p">Password</Label>
        <Input id="p" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <p className="rounded-md bg-danger-soft px-2.5 py-1.5 text-xs text-danger">{error}</p>}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy || !username || !password}>
        {busy ? <Loader2 className="animate-spin" /> : <Lock />} Sign in
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4">
      <div className="w-full max-w-[360px]">
        <div className="mb-6 flex items-center gap-3">
          <EyLogo className="h-10 w-10 text-fg" />
          <span className="h-8 w-px bg-border" aria-hidden />
          <div>
            <div className="text-[15px] font-semibold tracking-tight">Compliance Intelligence</div>
            <div className="text-[11px] text-muted">Demonstration</div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
          <h1 className="text-[15px] font-semibold">Sign in</h1>
          <p className="mb-4 mt-1 text-xs text-muted">Access is restricted. Workbook data is confidential to the engagement.</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-4 text-center text-[11px] text-subtle">Prepared by EY · Prototype · not a certified compliance system</p>
      </div>
    </div>
  );
}
