// Which Sources rows have an update available. Shared by the Sources page (client) and the sidebar badge (server),
// so the badge is always the number of "Update available" rows a user can act on. Pure: no database access.

/** True when `a` is a later version than `b` ("5.2.0" after "5.1.1"; "2.0" equals "2"). */
export const newerVersion = (a: string, b: string | null) => {
  const n = (v: string | null) => ((v ?? "").match(/\d+(?:\.\d+)*/)?.[0] ?? "").split(".").map(Number);
  const x = n(a), y = n(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};

export interface StatusDoc {
  id: string;
  version: string | null;
  familyVersions: { id: string }[];
  updates: { changeType: string; reviewStatus: string; newValue: string | null }[];
  pendingImport: { released: boolean } | null;
}
export interface StatusDemo {
  previousId: string | null;
  currentId: string | null;
  status: "AVAILABLE" | "UPDATED" | "REJECTED";
  released: boolean;
}

/**
 * One row per document. For a demo framework the row is the version the platform is on: the previous one until its
 * update is applied, then the new one. Otherwise the newest version of each family.
 * - offered: a released demo update not yet applied, or an uploaded new version an admin released (installable with Update).
 * - found:   a connector found a newer version that is not in the library yet.
 */
export function updateRows<D extends StatusDoc, U extends StatusDemo>(docs: D[], demo: U[]) {
  const demoOf = new Map<string, U>();
  for (const u of demo) for (const id of [u.previousId, u.currentId]) if (id) demoOf.set(id, u);
  const hidden = new Set(demo.map((u) => (u.status === "UPDATED" ? u.previousId : u.currentId)).filter(Boolean) as string[]);
  const byId = new Map(docs.map((d) => [d.id, d]));
  return docs
    .filter((d) => !hidden.has(d.id) && (demoOf.has(d.id) || d.familyVersions.at(-1)?.id === d.id || !d.familyVersions.length))
    .map((d) => {
      const u = demoOf.get(d.id) ?? null;
      const imp: D["pendingImport"] | null = u ? null : d.pendingImport;
      // Users see an update only once an admin has released it; until then the document reads as up to date.
      const offered = u ? u.status !== "UPDATED" && u.released : !!imp?.released;
      const found = !u && !offered
        ? [...d.updates, ...d.familyVersions.flatMap((v) => byId.get(v.id)?.updates ?? [])]
            // Only a version newer than the one shown: once installed, the same finding no longer means an update.
            .find((x) => x.changeType === "VERSION_CHANGE" && x.reviewStatus === "NEW" && x.newValue && newerVersion(x.newValue, d.version)) ?? null
        : null;
      const rejected = u?.status === "REJECTED";
      return {
        d, u, imp, offered, found, rejected,
        status: (offered || found ? "AVAILABLE" : "UPDATED") as "AVAILABLE" | "UPDATED",
        /** Counts towards the Sources badge: an update is available and has not been declined. */
        actionable: (offered || !!found) && !rejected,
      };
    });
}
