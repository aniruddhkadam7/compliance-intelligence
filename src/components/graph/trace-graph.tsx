"use client";
import { useMemo } from "react";
import { useNavigate } from "@/components/shell/nav-progress";
import { Background, Controls, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Library, ListTree, Quote, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type TraceKind = "framework" | "citation" | "requirement" | "control" | "more";

export interface TraceNode {
  id: string;
  kind: TraceKind;
  label: string;
  sublabel?: string;
  href?: string;
  emphasis?: boolean;
}
export interface TraceEdge {
  from: string;
  to: string;
  dashed?: boolean;
}

const COLUMN: Record<TraceKind, number> = { framework: 0, citation: 1, more: 1, requirement: 2, control: 3 };
const COL_X = [0, 290, 590, 890];
const ROW_H = 64;
const ICON = { framework: Library, citation: Quote, more: Quote, requirement: ListTree, control: ShieldCheck };
const KIND_LABEL = { framework: "Framework", citation: "Obligation", more: "Obligations", requirement: "Requirement", control: "CCF control" };

type FlowData = TraceNode & Record<string, unknown>;

function TraceNodeView({ data }: NodeProps<Node<FlowData>>) {
  const Icon = ICON[data.kind];
  return (
    <div
      className={cn(
        "w-[230px] rounded-md border bg-surface px-2.5 py-1.5 shadow-xs transition-colors",
        data.href && "cursor-pointer hover:border-accent",
        data.emphasis ? "border-accent ring-2 ring-accent-soft" : "border-border",
        data.kind === "more" && "border-dashed bg-surface-2",
      )}
    >
      <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-border-strong" />
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-subtle">
        <Icon className={cn("size-3", data.kind === "control" && "text-accent", data.kind === "framework" && "text-info")} />
        {KIND_LABEL[data.kind]}
      </div>
      <div className="truncate text-[12px] font-medium text-fg" title={data.label}>{data.label}</div>
      {data.sublabel && <div className="truncate text-[10.5px] text-muted" title={data.sublabel}>{data.sublabel}</div>}
      <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-border-strong" />
    </div>
  );
}

const nodeTypes = { trace: TraceNodeView };

export function TraceGraph({ nodes, edges, height = 520 }: { nodes: TraceNode[]; edges: TraceEdge[]; height?: number }) {
  const navigate = useNavigate();
  const flow = useMemo(() => {
    // Columns without nodes are dropped so the graph stays compact.
    const byCol: TraceNode[][] = [[], [], [], []];
    nodes.forEach((n) => byCol[COLUMN[n.kind]].push(n));
    const cols = byCol.filter((c) => c.length > 0);
    const maxRows = Math.max(...cols.map((c) => c.length), 1);
    const rf: Node<FlowData>[] = [];
    cols.forEach((col, ci) => {
      const offset = ((maxRows - col.length) * ROW_H) / 2;
      col.forEach((n, ri) => rf.push({ id: n.id, type: "trace", position: { x: COL_X[ci], y: offset + ri * ROW_H }, data: n as FlowData, draggable: true }));
    });
    const re: Edge[] = edges.map((e, i) => ({
      id: `e${i}`, source: e.from, target: e.to, type: "smoothstep",
      style: { stroke: "var(--border-strong)", strokeWidth: 1.25, strokeDasharray: e.dashed ? "4 3" : undefined },
    }));
    return { nodes: rf, edges: re, height: Math.min(Math.max(height, maxRows * ROW_H + 40), 900) };
  }, [nodes, edges, height]);

  return (
    <div style={{ height: flow.height }} className="rounded-md border border-border bg-surface-2">
      <ReactFlow
        nodes={flow.nodes}
        edges={flow.edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.08 }}
        minZoom={0.3}
        maxZoom={1.6}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => n.data.href && navigate(n.data.href)}
      >
        <Background gap={20} size={1} color="var(--border)" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}

export function GraphLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted">
      {(["framework", "citation", "control"] as const).map((k, i) => {
        const Icon = ICON[k];
        return (
          <span key={k} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-subtle">→</span>}
            <Icon className="size-3" /> {KIND_LABEL[k]}
          </span>
        );
      })}
      <span className="flex items-center gap-1.5"><span className="inline-block h-px w-5 border-t border-dashed border-border-strong" /> secondary mapping</span>
    </div>
  );
}
