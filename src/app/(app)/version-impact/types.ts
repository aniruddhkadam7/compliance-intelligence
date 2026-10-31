export interface Cit { id: string; sid: string; name: string }

export interface Comparison {
  from: { id: string; short: string; name: string; version: string | null; citations: number };
  to: { id: string; short: string; name: string; version: string | null; citations: number };
  summary: { both: number; onlyOld: number; onlyNew: number; functionChanged: number; controlsWithRefs: number; refsUnchanged: number; refsChanged: number; impactedControls: number };
  requirements: {
    id: string; requirementId: string; name: string | null; riskTopic: string | null; oldCitations: Cit[]; newCitations: Cit[];
    oldFunctions: string[]; newFunctions: string[]; status: "BOTH" | "ONLY_OLD" | "ONLY_NEW"; functionChanged: boolean;
    controls: { id: string; name: string; type: string }[];
  }[];
  flows: { from: string; to: string; count: number }[];
  referenceColumns: { old: string; new: string } | null;
  controlRefs: {
    control: { id: string; controlName: string; title: string | null };
    oldRaw: string | null; newRaw: string | null; unchanged: string[]; removed: string[]; added: string[]; reformatted: { from: string; to: string }[];
  }[];
  impactedControls: { id: string; name: string; reasons: string[] }[];
}

export interface Transition {
  id: string; isSample: boolean; controlName: string | null; oldFrameworkVersion: string | null; newFrameworkVersion: string | null;
  oldSectionId: string | null; newSectionId: string | null; previousFunction: string | null; newFunction: string | null;
  previousCitation: string | null; updatedCitation: string | null; existingTestProcedure: string | null; updatedTestProcedure: string | null;
  existingEvidence: string | null; additionalEvidence: string | null; scenario: string | null; sourceSheet: string; sourceRow: number;
  control: { id: string; controlName: string } | null; oldRequirements: string[]; newRequirements: string[];
  scenarioResolved: { code: "1" | "2" | "UNKNOWN"; basis: string };
}

export interface Families {
  families: { family: string; versions: { id: string; short: string; version: string | null; citations: number }[] }[];
  transitions: Transition[];
}
