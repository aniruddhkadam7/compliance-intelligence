"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, FolderOpen, Loader2, Save, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { apiGet, apiSend } from "@/lib/client/api";
import { useMe } from "@/lib/client/use-me";
import { cn } from "@/lib/utils";
import { OneDriveLogo, SharePointLogo, TeamsLogo } from "@/components/cloud-logos";

/**
 * Opens the shared SharePoint folder that holds the file to upload, so presenters pick the right file from one place
 * instead of their own computer. An admin sets the link in the Admin Console; until then the button is disabled.
 */
export function UploadFolderLink({ className }: { className?: string }) {
  const q = useQuery({ queryKey: ["upload-folder"], queryFn: () => apiGet<{ url: string | null }>("/api/settings/upload-folder") });
  const url = q.data?.url;
  if (!url)
    return (
      <Tooltip content={q.isLoading ? undefined : "No shared folder link yet. An admin adds it in the Admin Console."}>
        <span className={className}><Button size="sm" disabled><FolderOpen /> Open shared upload folder</Button></span>
      </Tooltip>
    );
  return (
    <Button asChild size="sm" className={className}>
      <a href={url} target="_blank" rel="noopener noreferrer"><FolderOpen /> Open shared upload folder <ExternalLink /></a>
    </Button>
  );
}

/**
 * Upload option for a file kept in Microsoft 365: opens the shared SharePoint / OneDrive / Teams folder so the presenter
 * takes the right file from there and drops it into the upload box. Shown beside the "from your computer" option.
 */
export function UploadFromCloud({ className }: { className?: string }) {
  const qc = useQueryClient();
  const me = useMe();
  const isAdmin = me.data?.role === "admin";
  const q = useQuery({ queryKey: ["upload-folder"], queryFn: () => apiGet<{ url: string | null }>("/api/settings/upload-folder") });
  const url = q.data?.url;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  // Same setting as the Admin Console; an admin can set it here where it is used.
  const save = async () => {
    setBusy(true);
    try {
      const r = await apiSend<{ url: string | null }>("/api/settings/upload-folder", { url: value.trim() || null }, "PUT");
      toast.success(r.url ? "Shared folder saved" : "Shared folder link removed");
      setEditing(false);
      await qc.invalidateQueries({ queryKey: ["upload-folder"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the link");
    } finally { setBusy(false); }
  };
  const host = url ? (() => { try { return new URL(url).hostname; } catch { return url; } })() : null;
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-strong bg-surface-2 px-6 py-6 text-center", className)}>
      <div className="flex items-center gap-2.5"><SharePointLogo /><OneDriveLogo /><TeamsLogo /></div>
      <div className="text-[13px] font-medium text-fg">From the team&apos;s shared SharePoint folder</div>
      {editing ? (
        <div className="flex w-full max-w-md flex-col gap-2">
          <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://…sharepoint.com/sites/…" aria-label="Shared folder link" onKeyDown={(e) => { if (e.key === "Enter") void save(); }} />
          <div className="flex justify-center gap-2">
            <Button size="sm" variant="primary" disabled={busy || value.trim() === (url ?? "")} onClick={save}>{busy ? <Loader2 className="animate-spin" /> : <Save />} Save folder</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="max-w-sm text-xs text-muted">
            {url ? <>Open the shared folder ({host}), download the workbook and drop it into the upload box. Picking the file directly from SharePoint is not connected yet.</>
              : isAdmin ? "No shared folder set yet. Add the team's SharePoint folder link so everyone uploads the same file."
              : "No shared folder set yet; an admin adds its link. Upload the file from your computer meanwhile."}
          </div>
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            {url ? <Button asChild size="sm" variant="primary"><a href={url} target="_blank" rel="noopener noreferrer"><FolderOpen /> Open shared folder <ExternalLink /></a></Button>
              : !isAdmin && <Button size="sm" disabled><FolderOpen /> Open shared folder</Button>}
            {isAdmin && <Button size="sm" variant={url ? "ghost" : "primary"} onClick={() => { setValue(url ?? ""); setEditing(true); }}><Settings2 /> {url ? "Change folder" : "Set shared folder"}</Button>}
          </div>
        </>
      )}
    </div>
  );
}
