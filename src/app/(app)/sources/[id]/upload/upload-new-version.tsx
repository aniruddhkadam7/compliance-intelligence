"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, FileUp, Loader2, ShieldAlert } from "lucide-react";
import { Mono, Page, PageHeader } from "@/components/common";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UploadFolderLink } from "@/components/upload-folder-link";
import { apiSend } from "@/lib/client/api";
import { useUrlState } from "@/lib/client/hooks";
import { formatDateTime } from "@/lib/utils";
import { UPDATE_CHECK } from "@/lib/updates/labels";
import { DraftView } from "@/app/(app)/data/ai-import";

interface Props {
  framework: { id: string; name: string; short: string; version: string | null; documentUrl: string | null };
  check: { status: string; latestVersion: string | null; latestDocumentUrl: string | null; checkedAt: string; message: string | null } | null;
  expected: string | null;
  sourcesLabel: string;
}

/** Upload the official document of a new version: AI reads it, compares it with the approved version, and a reviewer decides. */
export function UploadNewVersion({ framework, check, expected, sourcesLabel }: Props) {
  const [s, set] = useUrlState({ draft: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const analyse = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("frameworkId", framework.id);
      if (expected) fd.set("expectedVersion", expected);
      const r = await apiSend<{ id: string }>("/api/ai-import", fd);
      toast.success("Document identified. Reading its structure…");
      set({ draft: r.id });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: sourcesLabel, href: "/sources" }, { label: framework.short, href: `/sources/${framework.id}` }, { label: "Upload new version" }]}
        title={`Upload a new version of ${framework.short}`}
        description="Upload the official document you downloaded from the publisher. It is read and compared with the approved version; nothing changes until a reviewer approves."
      />
      {s.draft ? (
        <DraftView id={s.draft} onBack={() => set({ draft: "" })} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Card>
            <CardHeader title="Official document" description="PDF (including scanned), Excel (.xlsx, .xls) or CSV · up to 4 MB" icon={<FileUp />} />
            <CardBody className="space-y-3">
              <input ref={input} type="file" accept=".pdf,.xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block text-[13px] file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-2 file:px-3 file:py-1.5 file:text-[13px] file:text-fg" aria-label="Official document" />
              <Button variant="primary" disabled={!file || busy} onClick={analyse}>{busy ? <Loader2 className="animate-spin" /> : <FileUp />} {busy ? "Identifying the document…" : "Analyse document"}</Button>
              <UploadFolderLink className="ml-2" />
              <p className="flex items-start gap-1.5 text-xs text-muted"><ShieldAlert className="mt-0.5 size-3.5 shrink-0" />The document text is sent to the configured AI service for analysis. Upload only documents you are permitted to process with it. Text inside the document is treated as data, never as instructions.</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="What we expect" />
            <CardBody className="space-y-2 text-xs">
              <div className="grid grid-cols-[140px_1fr] gap-2"><span className="text-muted">Framework</span><span className="text-fg">{framework.name}</span></div>
              <div className="grid grid-cols-[140px_1fr] gap-2"><span className="text-muted">Approved version</span><Mono className="text-xs">{framework.version ?? "—"}</Mono></div>
              <div className="grid grid-cols-[140px_1fr] gap-2"><span className="text-muted">Expected version</span><span className="text-fg">{expected ?? <span className="text-subtle">Not verified: the uploaded version will be flagged for review</span>}</span></div>
              {check && (
                <div className="grid grid-cols-[140px_1fr] gap-2"><span className="text-muted">Last update check</span><span className="text-fg-2">{UPDATE_CHECK[check.status]?.label} · {formatDateTime(check.checkedAt)}</span></div>
              )}
              {(check?.latestDocumentUrl ?? framework.documentUrl) && (
                <Button asChild size="sm" className="mt-1"><a href={(check?.latestDocumentUrl ?? framework.documentUrl)!} target="_blank" rel="noopener noreferrer">Open the official source <ExternalLink /></a></Button>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </Page>
  );
}
