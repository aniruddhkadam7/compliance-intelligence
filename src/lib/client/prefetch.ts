"use client";
// Warms each page's first data queries when its sidebar link is hovered, so the request
// (a transatlantic round trip on the hosted demo) starts before the click. Query keys and
// URLs must match the pages exactly; the default filter states live here for that reason.
import type { QueryClient } from "@tanstack/react-query";
import { apiGet, qs } from "./api";

export const CITATION_DEFAULTS = {
  q: "", field: "all", frameworkId: "", family: "", version: "", mapped: "", sort: "", dir: "asc", page: "1", citation: "",
};
export const CONTROL_DEFAULTS = { q: "", category: "", scope: "", prefix: "", mapping: "", family: "", frameworkId: "", inScope: "", sort: "controlName", dir: "asc", page: "1" };

type Warm = { key: unknown[]; url: string };

const citationQuery = { ...CITATION_DEFAULTS, page: 1, citation: undefined };

const WARM: Record<string, Warm[]> = {
  "/frameworks": [{ key: ["frameworks", "", "", "", ""], url: "/api/frameworks" }],
  "/citations": [
    { key: ["citation-facets"], url: "/api/citations?view=facets" },
    { key: ["citations", citationQuery], url: `/api/citations${qs({ ...citationQuery })}` },
  ],
  "/mappings": [
    { key: ["fm-pairs", "supplied"], url: "/api/framework-matrix?basis=supplied" },
    { key: ["frameworks", "", "", "", ""], url: "/api/frameworks" },
  ],
  "/controls": [
    { key: ["control-facets"], url: "/api/controls?view=facets" },
    { key: ["controls", CONTROL_DEFAULTS], url: `/api/controls${qs({ ...CONTROL_DEFAULTS, page: 1 })}` },
  ],
  "/change-analytics": [{ key: ["rel-pairs", "VERSION_TRANSITION"], url: "/api/mappings?view=pairs&kind=VERSION_TRANSITION" }],
};

export function warmRoute(qc: QueryClient, href: string) {
  for (const w of WARM[href] ?? []) qc.prefetchQuery({ queryKey: w.key, queryFn: () => apiGet(w.url) });
}
