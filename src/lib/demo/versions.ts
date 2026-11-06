// Which framework version a client control points to while a framework update is under review. Pure, so it can be tested
// without a database; src/lib/demo/state.ts supplies the data and src/lib/queries/control-links.ts applies it to queries.

/** How a control relates to an applied update: awaiting approval, rejected (kept on the previous version) or approved. */
export type Highlight = "pending" | "updated" | "rejected";

/** One framework update as it stands for the client: what was applied and how each control was reviewed. */
export interface UpdateView {
  status: "AVAILABLE" | "UPDATED" | "REJECTED";
  /** The client's controls were uploaded after the update was applied, so they map to the new version outright. */
  uploadedAfter: boolean;
  previousId: string | null;
  currentId: string | null;
  /** Controls with at least one test procedure whose mapping differs between the two versions. */
  affected: ReadonlySet<string>;
  approved: ReadonlySet<string>;
  rejected: ReadonlySet<string>;
}

/**
 * For one control: the framework documents it must not show (`hidden`) and the documents of an applied update it is
 * being reviewed against (`highlight`). A control is on the new version when the update is applied and the control is
 * unaffected, was uploaded afterwards, or was approved; otherwise it stays on the previous version. An update with no
 * impact data (`affected` empty) leaves every control on the version it is mapped to.
 */
export function resolveVersions(updates: readonly UpdateView[], controlName: string) {
  const hidden = new Set<string>();
  const highlight = new Map<string, Highlight>();
  for (const u of updates) {
    if (!u.previousId || !u.currentId || !u.affected.size) continue;
    const onNew = u.status === "UPDATED" && (u.uploadedAfter || !u.affected.has(controlName) || u.approved.has(controlName));
    hidden.add(onNew ? u.previousId : u.currentId);
    if (u.status === "UPDATED" && !u.uploadedAfter && u.affected.has(controlName))
      highlight.set(onNew ? u.currentId : u.previousId, onNew ? "updated" : u.rejected.has(controlName) ? "rejected" : "pending");
  }
  return { hidden, highlight };
}
