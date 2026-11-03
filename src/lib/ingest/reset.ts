import type { PrismaClient } from "@prisma/client";

export const RESET_SCOPES = ["controls", "library", "transitions", "connectors"] as const;
export type ResetScope = (typeof RESET_SCOPES)[number];

export const RESET_SCOPE_LABELS: Record<ResetScope, string> = {
  controls: "Client controls and mappings",
  library: "Authoritative document library",
  transitions: "Version transition rows",
  connectors: "Connector history",
};

/**
 * Removes uploaded data in one transaction. Import history and the audit log are kept
 * so every reset remains traceable. Returns the number of rows removed per entity.
 */
export async function resetData(db: PrismaClient, scopes: ResetScope[], actor: string, role: string) {
  const counts: Record<string, number> = {};
  await db.$transaction(
    async (tx) => {
      // Client controls: everything uploaded by the client; the document library stays.
      if (scopes.includes("controls") || scopes.includes("library")) {
        counts.controlObligations = (await tx.controlObligation.deleteMany()).count;
        counts.procedureLinks = (await tx.testProcedureObligation.deleteMany()).count;
        counts.reviews = (await tx.unmappedRequirementReview.deleteMany()).count;
        counts.frameworkReferences = (await tx.controlFrameworkReference.deleteMany()).count;
        counts.evidence = (await tx.evidenceRequirement.deleteMany()).count;
        counts.testProcedures = (await tx.testProcedure.deleteMany()).count;
        counts.mappings = (await tx.controlRequirementMapping.deleteMany()).count;
        counts.controls = (await tx.ccfControl.deleteMany()).count;
      }
      // Document library: authoritative documents and their obligations (also removes client mappings above).
      if (scopes.includes("library")) {
        counts.citationLinks = (await tx.requirementCitation.deleteMany()).count;
        counts.citations = (await tx.citation.deleteMany()).count;
        counts.requirements = (await tx.integratedRequirement.deleteMany()).count;
        // Connectors keep running; their framework link is cleared (onDelete: SetNull).
        counts.frameworks = (await tx.framework.deleteMany()).count;
        counts.aiImports = (await tx.aiIngestion.deleteMany()).count;
      }
      if (scopes.includes("transitions")) counts.transitions = (await tx.versionTransition.deleteMany()).count;
      if (scopes.includes("connectors")) {
        counts.frameworkUpdates = (await tx.frameworkUpdate.deleteMany()).count;
        counts.connectorChecks = (await tx.connectorCheck.deleteMany()).count;
        await tx.connector.updateMany({
          data: { currentVersion: null, currentHash: null, lastCheckedAt: null, lastSuccessAt: null, lastStatus: null, lastError: null },
        });
        // The baseline is a Json column; clear it to SQL NULL so the next check records a fresh baseline.
        await tx.$executeRaw`UPDATE "Connector" SET "state" = NULL`;
      }
      await tx.auditLog.create({ data: { actor, role, action: "DATA_RESET", entity: "Database", details: { scopes, counts } } });
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
  return counts;
}
