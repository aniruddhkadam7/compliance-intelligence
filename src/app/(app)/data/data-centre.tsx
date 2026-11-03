"use client";
import { FileWarning, History, RotateCcw, ScrollText, Upload } from "lucide-react";
import { Page, PageHeader } from "@/components/common";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlState } from "@/lib/client/hooks";
import { ImportWizard } from "./import-wizard";
import { ImportHistory, AuditLogView } from "./history";
import { DataQuality } from "./quality";
import { ResetData } from "./reset";

export function DataCentre() {
  const [s, set] = useUrlState({ tab: "import", code: "", severity: "", draft: "" });
  return (
    <Page>
      <PageHeader
        title="Data & Imports"
        description="Upload a client control workbook, review its validation and preview, and track import history. New versions of frameworks are uploaded from Sources (Upload New Version)."
      />
      <Tabs value={s.tab} onValueChange={(v) => set({ tab: v, code: "", severity: "", draft: "" })}>
        <TabsList className="mb-4">
          <TabsTrigger value="import"><Upload /> Client controls upload</TabsTrigger>
          <TabsTrigger value="quality"><FileWarning /> Data quality</TabsTrigger>
          <TabsTrigger value="history"><History /> Import history</TabsTrigger>
          <TabsTrigger value="audit"><ScrollText /> Audit log</TabsTrigger>
          <TabsTrigger value="reset"><RotateCcw /> Reset data</TabsTrigger>
        </TabsList>
        <TabsContent value="import"><ImportWizard /></TabsContent>
        <TabsContent value="quality"><DataQuality code={s.code} severity={s.severity} onFilter={(p) => set(p)} /></TabsContent>
        <TabsContent value="history"><ImportHistory /></TabsContent>
        <TabsContent value="audit"><AuditLogView /></TabsContent>
        <TabsContent value="reset"><ResetData /></TabsContent>
      </Tabs>
    </Page>
  );
}
