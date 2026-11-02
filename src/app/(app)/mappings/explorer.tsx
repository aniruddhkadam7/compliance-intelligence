"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Network, Upload } from "lucide-react";
import { EmptyState, ErrorState, Page, PageHeader } from "@/components/common";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { RelationshipTable } from "@/components/relationship-table";
import { apiGet } from "@/lib/client/api";
import { useUrlState } from "@/lib/client/hooks";
import { TERMS } from "@/lib/terms";

interface Pair { from: string; to: string; count: number; fromShort: string; toShort: string }

/** Global framework intelligence: relationships between sections of different authoritative documents. */
export function MappingExplorer() {
  const [s, set] = useUrlState({ pair: "" });
  const pairs = useQuery({ queryKey: ["rel-pairs", "CROSS_FRAMEWORK"], queryFn: () => apiGet<Pair[]>("/api/mappings?view=pairs&kind=CROSS_FRAMEWORK") });
  const list = pairs.data ?? [];
  const pair = list.find((p) => `${p.from}|${p.to}` === s.pair) ?? list[0];

  return (
    <Page>
      <PageHeader
        title={TERMS.frameworkMapping}
        description="Relationships between sections of different authoritative documents, identified by Source ID. Only relationships supplied in mapping files are shown; none are inferred."
      />
      {pairs.isLoading && <Skeleton className="h-[320px]" />}
      {!!pairs.error && <Card><ErrorState error={pairs.error} onRetry={pairs.refetch} /></Card>}
      {pairs.data && !pair && (
        <Card>
          <EmptyState
            icon={Network}
            title="No framework relationships imported yet"
            description="Import a source relationship file with “Source ID A”, “Source ID B” and “Relationship” columns. Each row links a section of one document to a section of another."
            action={<Button asChild variant="primary"><Link href="/data?tab=import"><Upload /> Go to {TERMS.data}</Link></Button>}
          />
        </Card>
      )}
      {pair && (
        <div className="space-y-4">
          <Card className="flex flex-wrap items-center gap-3 p-3">
            <span className="text-xs text-muted">Documents</span>
            <Select
              value={`${pair.from}|${pair.to}`}
              onChange={(v) => set({ pair: v })}
              options={list.map((p) => ({ value: `${p.from}|${p.to}`, label: `${p.fromShort} ↔ ${p.toShort}`, hint: `${p.count} links` }))}
              triggerClassName="min-w-[260px]"
              aria-label="Document pair"
            />
          </Card>
          <RelationshipTable kind="CROSS_FRAMEWORK" from={pair.from} to={pair.to} />
        </div>
      )}
    </Page>
  );
}
