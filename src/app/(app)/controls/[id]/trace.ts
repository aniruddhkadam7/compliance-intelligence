import type { TraceEdge, TraceNode } from "@/components/graph/trace-graph";
import type { ControlDetail } from "@/lib/queries/controls";

/** Action key carried by a collapsed "+N obligations" node; expanding it shows that framework's obligations. */
export const expandAction = (frameworkId: string) => `expand:${frameworkId}`;

/**
 * Framework → Obligation → Control. Obligations are collapsed into one summary node per framework
 * when the trace is large; frameworks listed in `expanded` show every obligation.
 */
export function buildTrace(c: ControlDetail, expanded: ReadonlySet<string> = new Set()) {
  const PER_FRAMEWORK = c.trace.length <= 4 ? 3 : 0;
  const control = `k:${c.id}`;
  const nodes: TraceNode[] = [{ id: control, kind: "control", label: c.controlName, sublabel: c.title ?? undefined, emphasis: true }];
  const edges: TraceEdge[] = [];
  const seen = new Set<string>();
  const add = (n: TraceNode) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };

  for (const fw of c.trace) {
    // One entry per obligation; secondary only when the obligation is reached solely by a secondary mapping.
    const obligations = [...new Map(
      [...fw.citations].sort((x, y) => (x.mappingType === "SECONDARY" ? 1 : 0) - (y.mappingType === "SECONDARY" ? 1 : 0)).map((o) => [o.id, o]),
    ).values()];
    add({ id: `f:${fw.id}`, kind: "framework", label: fw.short, sublabel: `${obligations.length} obligation${obligations.length === 1 ? "" : "s"}`, href: `/frameworks/${fw.id}` });
    const shown = expanded.has(fw.id) ? obligations.length : PER_FRAMEWORK;
    obligations.slice(0, shown).forEach((o) => {
      add({ id: `c:${o.id}`, kind: "citation", label: o.sectionName.split(" - ").slice(-1)[0], sublabel: `Obligation ${o.sourceSectionId}`, href: `/citations?citation=${o.sourceSectionId}` });
      edges.push({ from: `f:${fw.id}`, to: `c:${o.id}` }, { from: `c:${o.id}`, to: control, dashed: o.mappingType === "SECONDARY" });
    });
    const rest = obligations.length - shown;
    if (rest > 0) {
      const id = `m:${fw.id}`;
      add({
        id, kind: "more", label: shown ? `+${rest} more obligation${rest > 1 ? "s" : ""}` : `${rest} obligation${rest > 1 ? "s" : ""}`,
        sublabel: `${fw.short} · click to expand`, action: expandAction(fw.id),
      });
      edges.push({ from: `f:${fw.id}`, to: id }, { from: id, to: control });
    }
  }
  return { nodes, edges };
}
