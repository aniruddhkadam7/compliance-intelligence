"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, BellRing, BookOpenText, Check, Download, ExternalLink, Globe, Library, Loader2, RefreshCw, ScanSearch, Search, X } from "lucide-react";
import { useProgressSteps, type ProgressStep } from "@/components/progress-steps";
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
import { cn, formatDate, formatDateTime, formatNumber } from "@/lib/utils";
import type { SourceRow } from "@/lib/queries/sources";
import { VersionChanges } from "./version-changes";

const DEFAULTS = { q: "", type: "", publisher: "", applicability: "", status: "", source: "" };
type Check = NonNullable<SourceRow["latestCheck"]>;

const facet = (rows: SourceRow[], k: (r: SourceRow) => string | null) =>
  [...rows.reduce((m, r) => { const v = k(r); if (v) m.set(v, (m.get(v) ?? 0) + 1); return m; }, new Map<string, number>())]
    .sort((a, b) => a[0].localeCompare(b[0])).map(([value, n]) => ({ value, label: value, hint: n }));

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
      </> : <Button size="sm" variant="primary" onClick={() => setConfirming(true)}>Update to {p.version ?? "new version"}</Button>}
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

/** A framework update offered in the demonstration flow, with the library documents of both versions. */
export interface DemoUpdate {
  key: string; family: string; previous: string; current: string; published: string | null;
  status: "AVAILABLE" | "UPDATED" | "REJECTED"; previousId: string | null; currentId: string | null;
  /** Released to users by an admin (updates that need no release are always released). */
  released: boolean;
}

/** An update a user can install from Sources: a demo framework update, or an uploaded version an admin released. */
interface Offer { key: string; name: string; released: boolean; docId?: string; importId?: string; fromConnector?: string | null }

/** True when `a` is a later version than `b` ("5.2.0" after "5.1.1"; "2.0" equals "2"). */
const newerVersion = (a: string, b: string | null) => {
  const n = (v: string | null) => ((v ?? "").match(/\d+(?:\.\d+)*/)?.[0] ?? "").split(".").map(Number);
  const x = n(a), y = n(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};

/** The team's summary of a framework upgrade (Summary of changes workbook), shown on hover over the latest version. */
export interface ChangeSummary {
  legacySourceId: string | null; legacy: string; latest: string; upgrade: string;
  summary: string; affected: string; domains: string; merged: string; removed: string;
}

function SummaryCard({ s }: { s: ChangeSummary }) {
  const rows: [string, string][] = [["Affected sections", s.affected], ["Domains", s.domains], ["Merged", s.merged], ["Removed", s.removed]];
  return (
    <div className="space-y-1.5 py-1 text-left">
      <div className="text-[12px] font-semibold">{s.legacy} → {s.latest}</div>
      {s.upgrade && <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{s.upgrade} upgrade</div>}
      <p>{s.summary}</p>
      {rows.filter(([, v]) => v).map(([k, v]) => <p key={k}><span className="font-semibold">{k}: </span>{v}</p>)}
    </div>
  );
}

const STATUS_FILTERS = [{ value: "AVAILABLE", label: "Update available" }, { value: "UPDATED", label: "Updated" }];
export const versionLabel = (family: string, v: string | null) => (v && family === "CIS Controls" && /^\d/.test(v) ? `v${v}` : v);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const UPDATE_STEPS = (names: string[]): ProgressStep[] => [
  { icon: Globe, title: "Scanning publisher sources", detail: "Checking the NIST, CIS and ISO official sites for new releases" },
  { icon: Download, title: "Downloading new versions", detail: `${names.length} official document${names.length === 1 ? "" : "s"} retrieved from the publishers` },
  { icon: ScanSearch, title: "Extracting and verifying", detail: "Sections, identifiers and requirement text checked against the official document" },
  { icon: Library, title: "Updating the library", detail: "New versions installed; previous versions kept for client mappings" },
];

/**
 * Sources: every framework and document in the library with its current and latest version. Updates are applied
 * by selecting frameworks and choosing Update (or Reject to decline them).
 */
export function SourcesCatalog({ docs, demo, dates, summaries, role }: { docs: SourceRow[]; demo: DemoUpdate[]; dates: Record<string, string>; summaries: ChangeSummary[]; role: Role }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [s, set] = useUrlState(DEFAULTS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fading, setFading] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const progress = useProgressSteps();
  const canWrite = role !== "viewer";

  // One row per document. For a demo framework the row is the version the platform is on: the previous one until
  // its update is applied, then the new one. A document with an uploaded new version is offered once an admin releases it.
  const rowsAll = useMemo(() => {
    const demoOf = new Map<string, DemoUpdate>();
    for (const u of demo) for (const id of [u.previousId, u.currentId]) if (id) demoOf.set(id, u);
    const hidden = new Set(demo.map((u) => (u.status === "UPDATED" ? u.previousId : u.currentId)).filter(Boolean) as string[]);
    return docs
      .filter((d) => !hidden.has(d.id) && (demoOf.has(d.id) || d.familyVersions.at(-1)?.id === d.id || !d.familyVersions.length))
      .map((d) => {
        const u = demoOf.get(d.id) ?? null;
        const imp = u ? null : d.pendingImport;
        // Users see an update only once an admin has released it; until then the document reads as up to date.
        const offer: Offer | null = u && u.status !== "UPDATED" && u.released
          ? { key: u.key, name: `${u.family} ${versionLabel(u.family, u.current)}`, released: true }
          : imp?.released ? { key: `doc:${d.id}`, name: `${d.short} → ${imp.version ?? d.latestCheck?.latestVersion ?? "new version"}`, released: true, docId: d.id, importId: imp.id, fromConnector: imp.fromConnector } : null;
        // A connector found a newer version that is not in the library yet: shown as available, installable once uploaded.
        const found = !u && !offer
          ? [...d.updates, ...d.familyVersions.flatMap((v) => docs.find((x) => x.id === v.id)?.updates ?? [])]
              // Only a version newer than the one shown: once installed, the same finding no longer means an update.
              .find((x) => x.changeType === "VERSION_CHANGE" && x.reviewStatus === "NEW" && x.newValue && newerVersion(x.newValue, d.version)) ?? null
          : null;
        return {
          d, u, offer, found,
          status: (offer || found ? "AVAILABLE" : "UPDATED") as "AVAILABLE" | "UPDATED",
          rejected: u?.status === "REJECTED",
          current: versionLabel(u?.family ?? "", d.version),
          latest: found ? found.newValue : !offer ? versionLabel(u?.family ?? "", d.version) : u ? versionLabel(u.family, u.current) : imp!.version ?? d.latestCheck?.latestVersion ?? "New version",
          // The date of the version shown as "latest": from the workbook where it lists that version, else none.
          published: u
            ? (offer || u.status === "UPDATED" ? u.published : dates[d.sourceId] ?? null)
            : found || imp?.released ? d.latestCheck?.publicationDate ?? d.publishedDate ?? null
            : dates[d.sourceId] ?? d.latestCheck?.publicationDate ?? d.publishedDate,
        };
      });
  }, [docs, demo, dates]);
  type Row = (typeof rowsAll)[number];
  // A row's upgrade summary: the one whose legacy version is this document or another version of it in the library.
  const summaryOf = useMemo(() => {
    const bySourceId = new Map(summaries.filter((s) => s.legacySourceId).map((s) => [s.legacySourceId!, s]));
    const sourceIdOf = new Map(docs.map((d) => [d.id, d.sourceId]));
    return (d: SourceRow): ChangeSummary | null => {
      for (const id of [d.sourceId, ...d.familyVersions.map((v) => sourceIdOf.get(v.id))]) if (id && bySourceId.has(id)) return bySourceId.get(id)!;
      return null;
    };
  }, [docs, summaries]);
  // A framework is connected when a monitoring connector watches any version of it.
  const connectorsOf = (d: SourceRow) => {
    const seen = new Map<string, SourceRow["monitoring"][number]>();
    for (const m of [...d.monitoring, ...d.familyVersions.flatMap((v) => docs.find((x) => x.id === v.id)?.monitoring ?? [])]) seen.set(m.id, m);
    // The main connector first; a document watch (file fingerprint) after it.
    return [...seen.values()].sort((a, b) => Number(a.mechanism === "HTTP_FINGERPRINT") - Number(b.mechanism === "HTTP_FINGERPRINT"));
  };
  const connected = (d: SourceRow) => connectorsOf(d).length > 0;
  const rows = rowsAll.filter(({ d, status }) =>
    (!s.source || (s.source === "connected") === connected(d)) &&
    (!s.q || `${d.name} ${d.short} ${d.sourceId} ${d.publisher}`.toLowerCase().includes(s.q.toLowerCase())) &&
    (!s.type || d.type === s.type) && (!s.publisher || d.publisher === s.publisher) &&
    (!s.applicability || (s.applicability === "NONE" ? !d.applicability.tags.length : d.applicability.tags.includes(s.applicability as never))) &&
    (!s.status || s.status === status));
  const latest = rowsAll.map((r) => r.d);
  const available = rowsAll.filter((r) => r.status === "AVAILABLE");
  const selectable = (r: Row) => canWrite && !r.rejected && !!r.offer?.released;
  const selectableKeys = rows.filter(selectable).map((r) => r.offer!.key);
  const picked = rowsAll.filter((r) => r.offer && selected.has(r.offer.key)).map((r) => r.offer!);
  const active = [s.q, s.type, s.publisher, s.applicability, s.status, s.source].some(Boolean);
  const connectedCount = rowsAll.filter((r) => connected(r.d)).length;
  const tile = (status: string) => ({ onClick: () => set({ status: s.status === status ? "" : status }), active: s.status === status });
  const toggle = (key: string) => setSelected((x) => { const n = new Set(x); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const update = async () => {
    const names = picked.map((o) => o.name);
    const keys = picked.filter((o) => !o.docId).map((o) => o.key);
    const uploads = picked.filter((o) => o.docId);
    setBusy(true);
    try {
      await progress.run(`Updating ${picked.length} framework${picked.length === 1 ? "" : "s"}`, UPDATE_STEPS(names), async () => {
        if (keys.length) await apiSend("/api/demo", { action: "update", keys });
        // Uploaded versions released by an admin are installed into the library one by one.
        for (const o of uploads) await apiSend(`/api/frameworks/${o.docId}/apply-update`);
      }, names);
      toast.success(`${names.join(", ")} installed`, { description: "Client controls on the previous version are listed in Change Analytics for approval." });
      setSelected(new Set());
      qc.invalidateQueries(); // Change Analytics and Custom Control Mapping read this state too
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally { setBusy(false); }
  };
  const reject = async () => {
    const keys = picked.filter((o) => !o.docId).map((o) => o.key);
    setBusy(true);
    try {
      if (keys.length) await apiSend("/api/demo", { action: "reject", keys });
      // An uploaded version goes back to the admin: its release is withdrawn.
      for (const o of picked.filter((o) => o.importId)) await apiSend(`/api/ai-import/${o.importId}/release`, { released: false });
      setFading(new Set(picked.map((o) => o.key)));
      await sleep(700);
      toast.info(`Update rejected: ${picked.map((o) => o.name).join(", ")}`, { description: "The current version stays in use." });
      setSelected(new Set());
      qc.invalidateQueries(); // Change Analytics and Custom Control Mapping read this state too
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reject failed");
    } finally { setBusy(false); setFading(new Set()); }
  };

  return (
    <Page>
      {progress.overlay}
      <PageHeader
        title={TERMS.sourceIndex}
        description="Authoritative documents in the platform, the version in use, and the latest version published. Select the frameworks to update, then choose Update or Reject."
      />
      {!docs.length ? (
        <Card><EmptyState icon={BookOpenText} title="No authoritative documents loaded" description="The document library has not been loaded yet." /></Card>
      ) : (
        <>
          <StatStrip
            className="mb-4 sm:grid-cols-4 xl:grid-cols-4"
            items={[
              { label: "Frameworks and documents", value: latest.length, onClick: () => set({ status: "", source: "" }), active: !s.status && !s.source, sub: `${facet(latest, (d) => d.publisher).length} publishers` },
              { ...tile("AVAILABLE"), label: "Updates available", value: available.length, tone: available.length ? "warning" : "default", sub: "Newer version published" },
              { ...tile("UPDATED"), label: "Up to date", value: rowsAll.length - available.length, tone: "success", sub: "On the latest version" },
              { label: "Connectors", value: connectedCount, onClick: () => set({ source: s.source === "connected" ? "" : "connected" }), active: s.source === "connected", sub: "Official sources checked every day for new versions", hint: "Frameworks an official-source connector watches. Select to list them." },
            ]}
          />
          {available.length > 0 && (
            <Card className="mb-4 flex flex-wrap items-center gap-3 border-warning/50 bg-warning-soft/40 px-4 py-3">
              <BellRing className="size-4 text-warning" />
              <div className="min-w-0 flex-1 text-[13px]">
                <div className="font-semibold text-fg">Updates available.</div>
                <div className="text-xs text-fg-2">
                  {available.map((r) => `${r.u?.family ?? r.d.short} ${r.current ?? ""} → ${r.latest ?? ""}`).join(" · ")}
                  {canWrite && (picked.length ? ` · ${picked.length} selected` : " · select frameworks in the table")}
                </div>
              </div>
              {canWrite && <>
                <Button variant="primary" disabled={busy || !picked.length} onClick={update}>{busy && progress.running ? <Loader2 className="animate-spin" /> : <RefreshCw />} Update{picked.length ? ` (${picked.length})` : ""}</Button>
                <Button disabled={busy || !picked.length} onClick={reject}><X /> Reject</Button>
              </>}
            </Card>
          )}
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
              <Select value={s.status} onChange={(v) => set({ status: v })} allLabel="Any update status" options={STATUS_FILTERS.map((x) => ({ ...x, hint: rowsAll.filter((r) => r.status === x.value).length }))} aria-label="Update status" />
              <Select value={s.source} onChange={(v) => set({ source: v })} allLabel="Any monitoring" options={[{ value: "connected", label: "Monitored by a connector", hint: connectedCount }, { value: "manual", label: "Not monitored", hint: rowsAll.length - connectedCount }]} aria-label="Monitoring" />
              {active && <Button variant="ghost" size="sm" onClick={() => set({ q: "", type: "", publisher: "", applicability: "", status: "", source: "" })}><X /> Clear</Button>}
            </div>
            <div className="px-4 py-2 text-xs text-muted tabular">{s.source === "connected" ? `${rows.length} connectors` : `${rows.length} of ${rowsAll.length} documents`} · select a name for details</div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    <th className="w-10 py-2 pl-4">
                      {selectableKeys.length > 0 && (
                        <input
                          type="checkbox" aria-label="Select all updates" className="size-4 cursor-pointer accent-[#2e2e38]"
                          checked={selectableKeys.every((k) => selected.has(k))}
                          onChange={(e) => setSelected(e.target.checked ? new Set(selectableKeys) : new Set())}
                        />
                      )}
                    </th>
                    <th className="px-3 py-2">Framework / document</th><th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Current version</th><th className="px-3 py-2">Latest version</th>
                    <th className="px-3 py-2">Last published date</th><th className="px-3 py-2">Update status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const { d, u } = r;
                    const o = r.offer;
                    const fade = !!o && fading.has(o.key);
                    return (
                      <tr key={d.id} className={cn("border-b border-border align-top", o && selected.has(o.key) && "bg-accent-soft/40")}>
                        <td className="py-2.5 pl-4">
                          {selectable(r) && (
                            <input
                              type="checkbox" aria-label={`Select ${u?.family ?? d.short} update`} className={cn("size-4 cursor-pointer accent-[#2e2e38] transition-opacity duration-700", fade && "opacity-0")}
                              checked={selected.has(o!.key)} onChange={() => toggle(o!.key)}
                            />
                          )}
                        </td>
                        <td className="min-w-[220px] px-3 py-2.5">
                          <Link href={`/sources/${d.id}`} className="font-medium text-fg hover:text-accent hover:underline">{d.short}</Link>
                          <div className="line-clamp-1 text-[11px] text-muted">{d.publisher} · <Mono className="text-[11px]">{d.sourceId}</Mono> · {formatNumber(d.obligations)} requirements</div>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-fg-2">{d.type ?? "—"}</td>
                        <td className="px-3 py-2.5 text-xs">
                          {r.current ? <Mono>{r.current}</Mono> : <span className="text-muted">{/law|regulation/i.test(d.type ?? "") ? "As enacted" : "Not recorded"}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {r.latest ? (
                            <Tooltip content={summaryOf(d) && <SummaryCard s={summaryOf(d)!} />} className="max-w-md px-3 py-2">
                              <span className={cn(r.status === "AVAILABLE" && !r.rejected ? "font-semibold text-warning" : "text-fg-2", summaryOf(d) && "cursor-help underline decoration-dotted underline-offset-2")}>{r.latest}</span>
                            </Tooltip>
                          ) : <span className="text-subtle">—</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-fg-2">{r.published ? formatDate(r.published) : <span className="text-subtle">—</span>}</td>
                        <td className="px-3 py-2.5">
                          {r.status === "AVAILABLE" ? (
                            <Tooltip content={r.rejected ? "Update rejected; the current version stays in use" : r.found ? `Version ${r.latest} was found by ${r.found.connector}; it is not in the library yet` : !o?.released ? `Version ${r.latest} is waiting for an admin to release it` : `Version ${r.latest} is available`}>
                              <span className={cn("flex flex-col whitespace-nowrap text-xs transition-opacity duration-700", (r.rejected || fade) && "opacity-50")}>
                                <span className="flex items-center gap-1.5"><Dot tone="warning" />Update available</span>
                                {r.found && !r.rejected && <span className="pl-3 text-[11px] text-muted">Found by connector · not in the library yet</span>}
                                {o && !r.found && !r.rejected && <span className="pl-3 text-[11px] text-muted">{o.fromConnector ? `New version downloaded by ${o.fromConnector}` : "New version in the Source Document Library"}</span>}
                              </span>
                            </Tooltip>
                          ) : (
                            <span className="flex flex-col whitespace-nowrap text-xs">
                              <span className="flex items-center gap-1.5"><Dot tone="success" />Updated</span>
                              {connected(d) && <span className="pl-3 text-[11px] text-muted">Verified from Source</span>}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!rows.length && <EmptyState title="No documents match" description="Change or clear the filters." />}
            </div>
          </Card>
        </>
      )}
    </Page>
  );
}

/** Evidence behind the latest check, and the "New framework version detected" notice. */
export function CheckDetails({ d, compact = false }: { d: Pick<SourceRow, "id" | "short" | "publisher" | "version" | "documentUrl" | "latestCheck"> & { installedUpdate?: string | null }; compact?: boolean }) {
  const c = d.latestCheck;
  if (!c)
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted">This document has not been checked yet. Use <b>Check for Updates</b> to verify the latest version at the publisher&apos;s official source.</p>
        {d.installedUpdate && <VersionChanges ingestionId={d.installedUpdate} />}
      </div>
    );
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
      {d.installedUpdate && <VersionChanges ingestionId={d.installedUpdate} />}
    </div>
  );
}
