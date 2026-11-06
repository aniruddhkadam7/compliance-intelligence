import type { TraceEdge, TraceNode } from "@/components/graph/trace-graph";
import type { ControlDetail } from "@/lib/queries/controls";

/** Action key carried by a collapsed obligations node; expanding it shows that framework's obligations. */
export const expandAction = (key: string) => `expand:${key}`;

/** Obligations listed directly below this count; at or above it they sit behind a "click to expand" node. */
export const COLLAPSE_AT = 8;

/**
 * Client control → test procedure → framework → obligations. A framework appears once per test procedure,
 * so two frameworks are never merged and each keeps only its own obligations. `expanded` holds the
 * `${procedureKey}:${frameworkId}` groups the user opened.
 */
export function buildTrace(c: ControlDetail, expanded: ReadonlySet<string> = new Set()) {
  const control = `k:${c.id}`;
  const nodes: TraceNode[] = [{ id: control, kind: "control", label: c.controlName, sublabel: c.title ?? undefined, emphasis: true }];
  const edges: TraceEdge[] = [];

  const branches = [
    ...c.procedureTrace.map((t) => ({ key: t.id, label: t.procedureId ?? "Unnumbered", sublabel: "Test procedure", frameworks: t.frameworks })),
    ...(c.controlLevel.length ? [{ key: "control", label: "No test procedure", sublabel: "Control-level mapping", frameworks: c.controlLevel }] : []),
  ];

  for (const b of branches) {
    const tp = `t:${b.key}`;
    nodes.push({ id: tp, kind: "procedure", label: b.label, sublabel: b.sublabel });
    edges.push({ from: control, to: tp });
    for (const fw of b.frameworks) {
      const group = `${b.key}:${fw.id}`;
      const f = `f:${group}`;
      const n = fw.obligations.length;
      const flag = c.versionFlags[fw.id];
      nodes.push({
        id: f, kind: "framework", label: fw.short, href: `/frameworks/${fw.id}`,
        sublabel: `${n} obligation${n === 1 ? "" : "s"}${flag === "pending" ? " · approval pending" : flag === "rejected" ? " · rejected, kept" : flag === "updated" ? " · updated" : ""}`,
        tone: flag === "pending" || flag === "rejected" ? "warning" : flag === "updated" ? "success" : undefined,
      });
      edges.push({ from: tp, to: f });
      if (n >= COLLAPSE_AT && !expanded.has(group)) {
        const more = `m:${group}`;
        nodes.push({ id: more, kind: "more", label: `${n} obligations`, sublabel: `${fw.short} · click to expand`, action: expandAction(group) });
        edges.push({ from: f, to: more });
        continue;
      }
      for (const o of fw.obligations) {
        const id = `c:${group}:${o.id}`;
        nodes.push({
          id, kind: "citation", label: o.sectionName.split(" - ").slice(-1)[0],
          sublabel: `Obligation ${o.sourceSectionId}${o.demo ? " · illustrative" : ""}`, href: `/citations?citation=${o.sourceSectionId}`,
        });
        edges.push({ from: f, to: id, dashed: o.demo });
      }
    }
  }
  return { nodes, edges };
}
