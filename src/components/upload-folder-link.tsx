"use client";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { apiGet } from "@/lib/client/api";
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
  const q = useQuery({ queryKey: ["upload-folder"], queryFn: () => apiGet<{ url: string | null }>("/api/settings/upload-folder") });
  const url = q.data?.url;
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-strong bg-surface-2 px-6 py-8 text-center", className)}>
      <div className="flex items-center gap-2.5"><SharePointLogo /><OneDriveLogo /><TeamsLogo /></div>
      <div className="text-[13px] font-medium text-fg">From SharePoint, OneDrive or Teams</div>
      <div className="max-w-sm text-xs text-muted">
        {url ? "Open the shared folder, then drag the file from it into the box on the left." : "No shared folder yet. An admin adds its link in the Admin Console."}
      </div>
      {url ? (
        <Button asChild size="sm" variant="primary" className="mt-1"><a href={url} target="_blank" rel="noopener noreferrer"><FolderOpen /> Open shared folder <ExternalLink /></a></Button>
      ) : (
        <Button size="sm" disabled className="mt-1"><FolderOpen /> Open shared folder</Button>
      )}
    </div>
  );
}
