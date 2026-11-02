"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2, RotateCcw, ShieldOff } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog } from "@/components/ui/sheet";
import { apiGet, apiSend } from "@/lib/client/api";
import { useMe } from "@/lib/client/use-me";
import { cn, formatNumber } from "@/lib/utils";

interface Counts { frameworks: number; citations: number; requirements: number; controls: number; transitions: number; updates: number; checks: number }
type Scope = "controls" | "library" | "transitions" | "connectors";

const plural = (n: number, noun: string) => `${formatNumber(n)} ${noun}${n === 1 ? "" : "s"}`;

const OPTIONS: { scope: Scope; title: string; detail: (c: Counts) => string; note: string }[] = [
  {
    scope: "controls", title: "Client controls and mappings",
    detail: (c) => `${plural(c.controls, "control")}, plus their test procedures, evidence and mappings`,
    note: "The authoritative document library is kept. Control pages stay empty until controls are uploaded again.",
  },
  {
    scope: "library", title: "Authoritative document library",
    detail: (c) => `${plural(c.frameworks, "document")} · ${formatNumber(c.citations)} obligations (also removes client mappings)`,
    note: "Only needed to reload the library itself.",
  },
  {
    scope: "connectors", title: "Connector history",
    detail: (c) => `${plural(c.updates, "detected update")} (including review decisions) · ${plural(c.checks, "check record")} · baselines`,
    note: "The next check records a fresh baseline. Connector definitions stay.",
  },
];

export function ResetData() {
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const isAdmin = me.data?.role === "admin";
  const counts = useQuery({ queryKey: ["reset-counts"], queryFn: () => apiGet<Counts>("/api/data/reset") });
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (s: Scope) => setScopes((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]));

  async function run() {
    setBusy(true);
    try {
      const r = await apiSend<{ counts: Record<string, number> }>("/api/data/reset", { scopes, confirm });
      const removed = Object.values(r.counts).reduce((n, v) => n + v, 0);
      toast.success(`Reset complete: ${formatNumber(removed)} records removed`, { description: "Recorded in the audit log." });
      setOpen(false);
      setConfirm("");
      setScopes([]);
      qc.invalidateQueries();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      {!isAdmin && me.data && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted">
          <ShieldOff className="size-3.5" /> Signed in as {me.data.role}. Only an admin can reset data.
        </div>
      )}
      <Card>
        <CardHeader
          title="Reset uploaded data"
          description="Remove data so a fresh workbook can be loaded, or clear connector history. The audit log and import history are always kept."
          icon={<RotateCcw />}
        />
        <CardBody className="space-y-2">
          {OPTIONS.map((o) => (
            <label
              key={o.scope}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
                scopes.includes(o.scope) ? "border-danger/50 bg-danger-soft/40" : "border-border hover:bg-surface-2",
                !isAdmin && "cursor-not-allowed opacity-60",
              )}
            >
              <input type="checkbox" className="mt-0.5 size-4 accent-[var(--danger)]" checked={scopes.includes(o.scope)} disabled={!isAdmin} onChange={() => toggle(o.scope)} />
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-fg">{o.title}</div>
                <div className="mt-0.5 text-xs text-fg-2">{counts.data ? o.detail(counts.data) : "…"}</div>
                <div className="mt-0.5 text-[11px] text-muted">{o.note}</div>
              </div>
            </label>
          ))}
          <div className="flex justify-end pt-2">
            <Button variant="danger" disabled={!isAdmin || !scopes.length} onClick={() => setOpen(true)}>
              <RotateCcw /> Reset selected data
            </Button>
          </div>
        </CardBody>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(o) => { setOpen(o); if (!o) setConfirm(""); }}
        title="Reset selected data?"
        description="This permanently deletes the selected data from the database. It cannot be undone. The original Excel files are not affected."
        footer={
          <>
            <Button onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="danger" disabled={confirm !== "RESET" || busy} onClick={run}>
              {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />} Reset
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <ul className="space-y-1 text-[13px] text-fg-2">
            {OPTIONS.filter((o) => scopes.includes(o.scope)).map((o) => (
              <li key={o.scope} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-danger" />{o.title}</li>
            ))}
          </ul>
          <div className="space-y-1.5">
            <Label htmlFor="reset-confirm">Type <span className="font-mono font-semibold text-fg">RESET</span> to confirm</Label>
            <Input id="reset-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
