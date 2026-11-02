"use client";
import Link from "next/link";
import { ArrowRight, FileSpreadsheet, GitCompareArrows } from "lucide-react";
import { EmptyState, Page, PageHeader } from "@/components/common";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// The legacy-to-latest relationship is supplied as a file that maps legacy source IDs to
// latest source IDs. Until it is imported this view only explains what it will show.
// (The earlier requirement-based views live in ./matrix, ./pairs, ./graph-view and ./unmapped.)

const OUTCOMES: [string, string][] = [
  ["Unchanged", "The legacy section carries over to the latest version as is."],
  ["Changed", "The section continues but its wording or scope has changed."],
  ["Split", "One legacy section is now covered by several latest sections."],
  ["Combined", "Several legacy sections are merged into one latest section."],
  ["Added", "A new section with no legacy equivalent."],
  ["Retired", "A legacy section with no equivalent in the latest version."],
];

export function MappingExplorer() {
  return (
    <Page>
      <PageHeader
        title="Legacy vs Latest"
        description="How each section of a legacy framework version moves to the latest version (for example NIST CSF 1.1 to 2.0), and which CCF controls are affected."
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <EmptyState
            icon={FileSpreadsheet}
            title="Awaiting the legacy-to-latest mapping file"
            description="This view is driven by a file that maps each legacy source ID to its latest source ID (for example 200 → 310). Once it is imported, every legacy section is shown next to its latest counterpart with the controls mapped to each."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild size="sm" variant="primary"><Link href="/data?tab=import">Go to Data & Imports</Link></Button>
                <Button asChild size="sm"><Link href="/version-impact"><GitCompareArrows /> See Version Impact</Link></Button>
              </div>
            }
          />
        </Card>
        <Card>
          <CardHeader title="What each mapping will show" />
          <CardBody>
            <ul className="space-y-2.5">
              {OUTCOMES.map(([label, text]) => (
                <li key={label} className="flex items-start gap-2 text-[13px]">
                  <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-accent" />
                  <span><span className="font-medium text-fg">{label}.</span> <span className="text-fg-2">{text}</span></span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </Page>
  );
}
