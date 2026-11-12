"use client";
import { History, RotateCcw, ScrollText, Upload } from "lucide-react";
import { Page, PageHeader } from "@/components/common";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlState } from "@/lib/client/hooks";
import { ImportWizard } from "./import-wizard";
import { ImportHistory, AuditLogView } from "./history";
import { ResetData } from "./reset";

export function DataCentre() {
  const [s, set] = useUrlState({ tab: "import", draft: "" });
  return (
    <Page>
      <PageHeader
        title="Data & Imports"
        description="Upload the custom control workbook, confirm the import, and track import history. New versions of frameworks are uploaded from Sources (Upload New Version)."
      />
      <Tabs value={s.tab} onValueChange={(v) => set({ tab: v, draft: "" })}>
        <TabsList className="mb-4">
          <TabsTrigger value="import"><Upload /> Custom controls upload</TabsTrigger>
          <TabsTrigger value="history"><History /> Import history</TabsTrigger>
          <TabsTrigger value="audit"><ScrollText /> Audit log</TabsTrigger>
          <TabsTrigger value="reset"><RotateCcw /> Reset data</TabsTrigger>
        </TabsList>
        <TabsContent value="import"><ImportWizard /></TabsContent>
        <TabsContent value="history"><ImportHistory /></TabsContent>
        <TabsContent value="audit"><AuditLogView /></TabsContent>
        <TabsContent value="reset"><ResetData /></TabsContent>
      </Tabs>
    </Page>
  );
}
