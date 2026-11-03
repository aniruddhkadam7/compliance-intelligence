// Display helpers derived from ArC "Source Name" text. These never replace the
// original name; they are labelled as derived wherever they are shown.

const ACRONYM_HINTS: [RegExp, string][] = [
  [/\(GDPR\b/i, "GDPR"],
  [/\(EU AI Act\)/i, "EU AI Act"],
  [/\(AI RMF ([\d.]+)\)/i, "NIST AI RMF"],
  [/\(CSA-CCM\)/i, "CSA CCM"],
  [/Cybersecurity Framework \(CSF\)|\(NIST CSF\)/i, "NIST CSF"],
  [/Personal Information Protection Law/i, "China PIPL"],
  [/Sarbanes-Oxley/i, "SOX"],
  [/21 CFR 11/i, "21 CFR Part 11"],
];

/** Version token found in a source name, e.g. "v8.1", "2.0", "r5.1.1", "2019". */
export function deriveVersion(name: string): string | null {
  const patterns: RegExp[] = [
    /\bv(\d+(?:\.\d+)*)\b/i, // v1.1, v8, v4.0
    /\b(?:\d+-\d+)?r(\d+(?:\.\d+)*)\b/i, // r5.1.1, 800-82r3
    /\bRev\s?(\d+(?:\.\d+)*)/i, // Rev1
    /\(CSF\)\s+(\d+(?:\.\d+)*)/i, // (CSF) 2.0
    /\bRMF (\d+(?:\.\d+)*)\)/i, // AI RMF 1.0
    /\b\d{4,5}(?:-\d+)*:(\d{4})\b/, // ISO 27017:2015
    /\b\d{4,5}-(\d{4})\b/, // ISO-IEC 42001-2023
    /\b(\d\.\d)\b/, // COBIT 4.1
  ];
  for (const p of patterns) {
    const m = name.match(p);
    if (m) return m[1];
  }
  const yr = name.match(/\b(19|20)\d{2}\b/);
  return yr ? yr[0] : null;
}

/** Family groups versions of the same framework, e.g. NIST CSF 1.1 and 2.0. */
export function deriveFamily(name: string): string {
  for (const [re, label] of ACRONYM_HINTS) if (re.test(name)) return label;
  if (/^CIS Controls/i.test(name)) return "CIS Controls";
  const iso = name.match(/^(ISO(?:[\/-]IEC)?)[\s:/-]*(\d{4,5})/i);
  if (iso) return `${iso[1].replace("-", "/")} ${iso[2]}`;
  const iec = name.match(/^IEC Standard (62443-[\d-]+)/i);
  if (iec) return `IEC ${iec[1].replace(/:\d{4}$/, "")}`;
  const sp = name.match(/^NIST SP (800-\d+)/i);
  if (sp) return `NIST SP ${sp[1]}`;
  return name.split(" - ")[0].trim();
}

/**
 * Identity of a document independent of its Source ID: family and version ("NIST CSF|1.1"). Workbooks can
 * renumber Source IDs, so documents are matched across files and records by this key.
 */
export const documentKey = (name: string) => {
  const version = deriveVersion(name) ?? "";
  // A family that ends in its own version ("NIST CSF 1.1", "COBIT 4.1") is keyed without it.
  const family = version ? deriveFamily(name).replace(new RegExp(`\\s+v?${version.replace(/\./g, "\\.")}$`, "i"), "") : deriveFamily(name);
  return `${family}|${version}`;
};

/** Compact label for tables and charts. */
export function shortName(name: string): string {
  const family = deriveFamily(name);
  const version = deriveVersion(name);
  if (family === "SOX" || family === "21 CFR Part 11" || family === "China PIPL" || family === "EU AI Act" || family === "GDPR")
    return family;
  if (!version || family.includes(version)) return family;
  if (/^(ISO|IEC)/.test(family)) return `${family}:${version}`;
  if (family.startsWith("NIST SP")) return `${family} r${version}`;
  return `${family} ${version}`;
}
