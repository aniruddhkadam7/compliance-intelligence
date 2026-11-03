"use client";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, BellRing, BookOpenText, Check, ChevronRight, Download, ExternalLink, Eye, Loader2, RefreshCw, Search, X } from "lucide-react";
import { EmptyState, Mono, Page, PageHeader, StatStrip } from "@/components/common";
import { Card } from "@/components/ui/card";
import { Badge, Dot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tooltip } from "@/components/ui/tooltip";
import { apiSend } from "@/lib/client/api";
import { useUrlState } from "@/lib/client/hooks";
import { APPLICABILITY_TAGS, BASIS_LABEL } from "@/lib/sources/applicability";
import { CHECK_METHOD, UPDATE_CHECK } from "@/lib/updates/labels";
import { TERMS } from "@/lib/terms";
import { cn, formatDate, formatDateTime, formatNumber, formatRelative } from "@/lib/utils";
import type { SourceRow } from "@/lib/queries/sources";

const DEFAULTS = { q: "", type: "", publisher: "", applicability: "", status: "", open: "" };
type Check = NonNullable<SourceRow["latestCheck"]>;

const facet = (rows: SourceRow[], k: (r: SourceRow) => string | null) =>
  [...rows.reduce((m, r) => { const v = k(r); if (v) m.set(v, (m.get(v) ?? 0) + 1); return m; }, new Map<string, number>())]
    .sort((a, b) => a[0].localeCompare(b[0])).map(([value, n]) => ({ value, label: value, hint: n }));
const statusOf = (d: SourceRow) => d.latestCheck?.status ?? "NOT_CHECKED";

export function ApplicabilityChips({ a }: { a: SourceRow["applicability"] }) {
  if (!a.tags.length) return <span className="text-xs text-subtle">Not classified</span>;
  return (
    <Tooltip content={BASIS_LABEL[a.basis]}>
      <span className="inline-flex gap-1">
        {a.tags.map((t) => <Badge key={t} tone={a.basis === "SUPPLIED" ? "accent" : "outline"}>{t}{a.basis === "TITLE" && "*"}</Badge>)}
      </span>
    </Tooltip>
  );
}

/** Predecessor stated by the publisher whose text is not loaded; the note and official source back it up. */
export function RecordedPrevious({ p, law = false }: { p: SourceRow["recordedPrevious"]; law?: boolean }) {
  if (!p) return <Tooltip content="No previous version is recorded for this document."><span className="text-subtle">—</span></Tooltip>;
  return (
    <Tooltip content={<span className="block max-w-xs">{p.note}{p.source && <span className="mt-1 block break-all text-subtle">Source: {p.source}</span>}</span>}>
      <span onClick={(e) => e.stopPropagation()}>
        {p.version ? <>
          {p.source ? <a href={p.source} target="_blank" rel="noopener noreferrer" className="font-mono text-fg-2 hover:text-accent hover:underline">{p.version}</a> : <Mono>{p.version}</Mono>}
          <div className="text-[11px] text-subtle">Not loaded</div>
        </> : <span className="text-muted">{law ? "None (original act)" : "None (first edition)"}</span>}
      </span>
    </Tooltip>
  );
}

export type Role = "admin" | "analyst" | "viewer";

/**
 * Update state of a document for users: a released update is one click ("Update"), an upload still in
 * admin review is shown as such. The previous version always stays in the library.
 */
export function UpdateAction({ d, role }: { d: Pick<SourceRow, "id" | "short" | "pendingImport">; role: Role }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const p = d.pendingImport;
  if (!p) return null;
  const label = p.version ? `version ${p.version}` : "the new version";
  if (!p.released) return null;
  if (role === "viewer") return <div className="whitespace-nowrap text-[11px] text-muted">Update ready: ask an analyst to apply it</div>;
  const apply = async () => {
    setBusy(true);
    try {
      const r = await apiSend<{ version: string; added: number; check: { status: string; message: string | null } }>(`/api/frameworks/${d.id}/apply-update`);
      toast.success(`${d.short} updated to ${r.version}: ${formatNumber(r.added)} requirements`);
      if (r.check.status === "UP_TO_DATE") toast.success(`${d.short} is now up to date`, { description: r.check.message ?? undefined });
      else toast.info(`Publisher check: ${UPDATE_CHECK[r.check.status as keyof typeof UPDATE_CHECK]?.label ?? r.check.status}`, { description: r.check.message ?? undefined });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally { setBusy(false); setConfirming(false); }
  };
  return (
    <span className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {confirming ? <>
        <span className="text-[11px] text-fg-2">Install {label}? The current version is kept.</span>
        <Button size="sm" variant="primary" disabled={busy} onClick={apply}>{busy ? <Loader2 className="animate-spin" /> : <Check />} Confirm</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button>
      </> : <Button size="sm" variant="primary" onClick={() => setConfirming(true)}><Download /> Update to {p.version ?? "new version"}</Button>}
    </span>
  );
}

/** Runs "Check for Updates" for one or more documents, one after another, and refreshes the page. */
export function useCheckForUpdates() {
  const router = useRouter();
  const [running, setRunning] = useState<{ done: number; total: number; current: string } | null>(null);
  const run = async (docs: { id: string; short: string }[]) => {
    setRunning({ done: 0, total: docs.length, current: docs[0]?.short ?? "" });
    let found = 0;
    for (const [i, d] of docs.entries()) {
      setRunning({ done: i, total: docs.length, current: d.short });
      try {
        const r = await apiSend<Check>(`/api/frameworks/${d.id}/check-updates`);
        if (r.status === "UPDATE_AVAILABLE") { found++; toast.warning(`New framework version detected: ${d.short}`, { description: r.message ?? undefined }); }
        else if (docs.length === 1) (r.status === "CHECK_FAILED" ? toast.error : toast.success)(`${d.short}: ${UPDATE_CHECK[r.status].label}`, { description: r.message ?? undefined });
      } catch (e) {
        toast.error(`${d.short}: ${e instanceof Error ? e.message : "check failed"}`);
      }
    }
    if (docs.length > 1) toast.success(`Checked ${docs.length} documents · ${found} update(s) available`);
    setRunning(null);
    router.refresh();
  };
  return { run, running };
}

export function SourcesCatalog({ docs, role }: { docs: SourceRow[]; role: Role }) {
  const [s, set] = useUrlState(DEFAULTS);
  const { run, running } = useCheckForUpdates();
  // One row per document: the latest loaded version, with earlier versions listed beneath it.
  const byId = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  const latest = useMemo(() => docs.filter((d) => d.familyVersions.at(-1)?.id === d.id || !d.familyVersions.length), [docs]);
  const rows = useMemo(
    () => latest.filter((d) =>
      (!s.q || `${d.name} ${d.short} ${d.sourceId} ${d.publisher}`.toLowerCase().includes(s.q.toLowerCase())) &&
      (!s.type || d.type === s.type) && (!s.publisher || d.publisher === s.publisher) &&
      (!s.applicability || (s.applicability === "NONE" ? !d.applicability.tags.length : d.applicability.tags.includes(s.applicability as never))) &&
      (!s.status || s.status.split(",").includes(statusOf(d))),
    ),
    [latest, s],
  );
  // All matching rows are shown (the library is small), so the table always matches the stat strip count.
  const visible = rows;
  const active = [s.q, s.type, s.publisher, s.applicability, s.status].some(Boolean);
  const count = (st: string) => latest.filter((d) => statusOf(d) === st).length;
  const tile = (status: string) => ({ onClick: () => set({ status: s.status === status ? "" : status }), active: s.status === status });
  const BAD = "UNABLE_TO_VERIFY,CHECK_FAILED";
  const lastChecked = latest.map((d) => d.latestCheck?.checkedAt).filter(Boolean).sort().pop() ?? null;

  return (
    <Page>
      <PageHeader
        title={TERMS.sourceIndex}
        description="Authoritative documents in the platform, their approved versions, and the latest version verified at each publisher's official source. Check for updates, then upload a new official version for analysis and review."
        actions={<Button variant="primary" disabled={!!running || !latest.length} onClick={() => run(latest.map((d) => ({ id: d.id, short: d.short })))}>{running ? <Loader2 className="animate-spin" /> : <RefreshCw />} {running ? `Checking ${running.done + 1} of ${running.total}…` : "Check all for updates"}</Button>}
      />
      {!docs.length ? (
        <Card><EmptyState icon={BookOpenText} title="No authoritative documents loaded" description="The document library has not been loaded yet." /></Card>
      ) : (
        <>
          <StatStrip
            className="mb-4 xl:grid-cols-5"
            items={[
              { label: "Frameworks and documents", value: latest.length, onClick: () => set({ status: "" }), active: !s.status, sub: `${facet(latest, (d) => d.publisher).length} publishers` },
              { ...tile("UPDATE_AVAILABLE"), label: "Updates available", value: count("UPDATE_AVAILABLE"), tone: count("UPDATE_AVAILABLE") ? "warning" : "default", sub: "Verified at the official source" },
              { ...tile("UP_TO_DATE"), label: "Up to date", value: count("UP_TO_DATE"), sub: "No newer version verified" },
              { ...tile(BAD), label: "Unable to verify or failed", value: count("UNABLE_TO_VERIFY") + count("CHECK_FAILED"), sub: `${count("NOT_CHECKED")} not checked yet` },
              { label: "Last checked", value: lastChecked ? formatRelative(lastChecked) : "Never", sub: lastChecked ? formatDateTime(lastChecked) : "Run Check for Updates" },
            ]}
          />
          <Card>
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
                <Input value={s.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search framework or document…" className="pl-8" aria-label="Search documents" />
              </div>
              <Select value={s.publisher} onChange={(v) => set({ publisher: v })} allLabel="All publishers" options={facet(latest, (d) => d.publisher)} aria-label="Publisher" />
              <Select value={s.type} onChange={(v) => set({ type: v })} allLabel="All types" options={facet(latest, (d) => d.type)} aria-label="Type" />
              <Select
                value={s.applicability} onChange={(v) => set({ applicability: v })} allLabel="Any applicability" aria-label="Applicability"
                options={[...APPLICABILITY_TAGS.map((t) => ({ value: t, label: t, hint: latest.filter((d) => d.applicability.tags.includes(t)).length })), { value: "NONE", label: "Not classified", hint: latest.filter((d) => !d.applicability.tags.length).length }]}
              />
              <Select value={s.status} onChange={(v) => set({ status: v })} allLabel="Any update status" options={[...Object.entries(UPDATE_CHECK).map(([value, x]) => ({ value, label: x.label, hint: count(value) })), { value: BAD, label: "Unable to verify or failed", hint: count("UNABLE_TO_VERIFY") + count("CHECK_FAILED") }]} aria-label="Update status" />
              {active && <Button variant="ghost" size="sm" onClick={() => set({ q: "", type: "", publisher: "", applicability: "", status: "" })}><X /> Clear</Button>}
            </div>
            <div className="px-4 py-2 text-xs text-muted tabular">{rows.length} of {latest.length} documents · select a row for details and evidence</div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    <th className="w-8 py-2 pl-3" aria-label="Expand" />
                    <th className="px-3 py-2">Framework / document</th><th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Previous version</th><th className="px-3 py-2">Current approved version</th><th className="px-3 py-2">Latest available version</th>
                    <th className="px-3 py-2">Last checked</th><th className="px-3 py-2">Update status</th><th className="px-3 py-2">Update</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((d) => {
                    const c = d.latestCheck;
                    const st = UPDATE_CHECK[statusOf(d)];
                    const open = s.open === d.id;
                    return (
                      <Fragment key={d.id}>
                        <tr onClick={() => set({ open: open ? "" : d.id })} aria-expanded={open} className={cn("cursor-pointer border-b border-border align-top hover:bg-surface-2", open && "bg-surface-2")}>
                          <td className="py-2.5 pl-3"><ChevronRight className={cn("size-4 text-subtle transition-transform", open && "rotate-90 text-fg")} /></td>
                          <td className="min-w-[220px] px-3 py-2.5">
                            <Link href={`/sources/${d.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-fg hover:text-accent hover:underline">{d.short}</Link>
                            <div className="line-clamp-1 text-[11px] text-muted">{d.publisher} · <Mono className="text-[11px]">{d.sourceId}</Mono> · {formatNumber(d.obligations)} requirements</div>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-fg-2">{d.type ?? "—"}</td>
                          <td className="px-3 py-2.5 text-xs">
                            {d.familyVersions.length > 1 ? d.familyVersions.filter((v) => v.id !== d.id).reverse().map((v) => {
                              const n = byId.get(v.id)?.clientControls ?? 0;
                              return (
                                <div key={v.id}>
                                  <Link href={`/sources/${v.id}`} onClick={(e) => e.stopPropagation()} className="font-mono text-accent hover:underline">{v.version ?? v.short}</Link>
                                  {n > 0 && <div className="text-[11px] text-muted">{n} client control{n === 1 ? "" : "s"} still mapped</div>}
                                </div>
                              );
                            }) : <RecordedPrevious p={d.recordedPrevious} law={/law|regulation/i.test(d.type ?? "")} />}
                          </td>
                          <td className="px-3 py-2.5 text-xs">
                            {d.version ? <Mono>{d.version}</Mono> : (
                              <Tooltip content="The library holds this text without a version number; laws are identified by their enactment and amendment dates.">
                                <span className="text-muted">{/law|regulation/i.test(d.type ?? "") ? "As enacted" : "Not recorded"}</span>
                              </Tooltip>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-xs">
                            {c?.latestVersion && !/[　-鿿＀-￯]/.test(c.latestVersion) ? <span className={cn(c.status === "UPDATE_AVAILABLE" ? "font-semibold text-warning" : "text-fg-2")}>{c.latestVersion}</span> : <span className="text-subtle">—</span>}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-xs text-fg-2">{c ? formatRelative(c.checkedAt) : <span className="text-subtle">Never</span>}</td>
                          <td className="px-3 py-2.5">
                            <Tooltip content={c?.message ?? st.hint}><span className="flex items-center gap-1.5 whitespace-nowrap text-xs"><Dot tone={st.tone} />{st.label}</span></Tooltip>
                          </td>
                          <td className="px-3 py-2.5"><UpdateAction d={d} role={role} /></td>
                        </tr>
                        {open && (
                          <tr className="border-b border-border bg-surface-2/60">
                            <td colSpan={9} className="px-4 py-4"><CheckDetails d={d} /></td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {!rows.length && <EmptyState title="No documents match" description="Change or clear the filters." />}
            </div>
          </Card>
        </>
      )}
      <p className="mt-3 text-[11px] text-subtle">
        A version is reported only when the publisher&apos;s official source states it. When a source cannot be read reliably the status is &ldquo;Unable to verify&rdquo;, never &ldquo;Up to date&rdquo;.
      </p>
    </Page>
  );
}

/** Evidence behind the latest check, and the "New framework version detected" notice. */
export function CheckDetails({ d, compact = false }: { d: Pick<SourceRow, "id" | "short" | "publisher" | "version" | "documentUrl" | "latestCheck">; compact?: boolean }) {
  const c = d.latestCheck;
  if (!c)
    return <p className="text-xs text-muted">This document has not been checked yet. Use <b>Check for Updates</b> to verify the latest version at the publisher&apos;s official source.</p>;
  const ev = (c.evidence ?? {}) as Record<string, unknown>;
  const quotes = [["Version statement", ev.versionQuote], ["Newer version statement", ev.newerQuote], ["Date statement", ev.dateQuote], ["Publisher data", ev.statement]].filter(([, v]) => typeof v === "string" && v) as [string, string][];
  return (
    <div className="space-y-3">
      {c.status === "UPDATE_AVAILABLE" && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-warning/50 bg-warning-soft/40 p-3">
          <BellRing className="size-4 text-warning" />
          <div className="min-w-0 flex-1 text-[13px]">
            <div className="font-semibold text-fg">New framework version detected.</div>
            <div className="text-xs text-fg-2">Approved: <Mono className="text-xs">{d.version ?? "—"}</Mono> <ArrowRight className="inline size-3" /> Latest available: <b>{c.latestVersion}</b>. Download the official document from the publisher, then upload it for analysis.</div>
          </div>
          {c.latestDocumentUrl && <Button asChild size="sm"><a href={c.latestDocumentUrl} target="_blank" rel="noopener noreferrer">Official source <ExternalLink /></a></Button>}
        </div>
      )}
      <div className={cn("grid gap-x-8 gap-y-1 text-xs", !compact && "md:grid-cols-2")}>
        {([
          ["Update status", <span key="s" className="flex items-center gap-1.5"><Dot tone={UPDATE_CHECK[c.status].tone} />{UPDATE_CHECK[c.status].label}</span>],
          ["Result", c.message],
          ["Current approved version", c.approvedVersion ?? d.version ?? "—"],
          ["Latest available version", c.latestVersion ?? "Not verified"],
          ["Publisher", d.publisher],
          ["Publication date", c.publicationDate ? formatDate(c.publicationDate) : "Not stated by the source"],
          ["Verification method", CHECK_METHOD[c.method] ?? c.method],
          ["Source checked", c.sourceUrl ? <a key="u" href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="break-all text-accent hover:underline">{c.sourceUrl}</a> : "—"],
          ["Checked", `${formatDateTime(c.checkedAt)} by ${c.checkedBy ?? "system"}`],
        ] as [string, React.ReactNode][]).map(([k, v]) => (
          <div key={k} className="grid grid-cols-[170px_1fr] gap-3 py-0.5"><span className="text-muted">{k}</span><span className="text-fg-2">{v}</span></div>
        ))}
      </div>
      {quotes.length > 0 && (
        <div className="rounded-md border border-border bg-surface p-3 text-xs">
          <div className="mb-1 font-semibold text-fg-2">Evidence</div>
          {quotes.map(([k, v]) => <div key={k} className="py-0.5"><span className="text-muted">{k}: </span><q className="text-fg-2">{v}</q></div>)}
          {typeof ev.rejected === "string" && <div className="mt-1 text-warning">{ev.rejected}</div>}
        </div>
      )}
    </div>
  );
}
