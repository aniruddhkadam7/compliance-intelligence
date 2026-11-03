// Structure parser for legal acts laid out like EUR-Lex texts (CHAPTER / SECTION / Article / numbered
// paragraphs / ANNEX). No AI: units are cut from the extracted text at their headings, so coverage is complete
// and the wording is the publisher's. Only layout is cleaned (page headers, ▼B/▼M1 markers, words split
// across lines). Documents without this structure go through the AI extraction instead.

export interface ActUnit {
  identifier: string; title: string; path: string[]; parentIdentifier: string | null;
  contentType: string; text: string; pageNumber: number; start: number;
}

export interface ActStructure {
  units: ActUnit[];
  articles: number; paragraphs: number; annexes: number;
  /** Article numbers absent from the sequence (e.g. deleted by an amendment); listed for the reviewer. */
  articleGaps: string[];
}

interface Line { text: string; start: number; end: number; page: number }

/** EUR-Lex page header ("02024R1689 — EN — 27.07.2026 — 001.001 — 12") and consolidation markers (▼B, ▼M1, ►M1, ◄). */
const NOISE = [/^0\d{4}[A-Z]\d{4}\s+—\s+[A-Z]{2}\s+—/, /^[▼►◄]\s*[A-Z]?\d*\b/, /^_{3,}$/];
const isNoise = (t: string) => NOISE.some((re) => re.test(t));

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
const roman = (s: string) => [...s].reduce((n, c, i, a) => (ROMAN[c] < (ROMAN[a[i + 1]] ?? 0) ? n - ROMAN[c] : n + ROMAN[c]), 0);
const SMALL = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with"]);
const titleCase = (s: string) => s.toLowerCase().split(/\s+/).map((w, i) => (i > 0 && SMALL.has(w) ? w : w.replace(/(^|-)([a-z])/g, (_, d, c) => d + c.toUpperCase()))).join(" ").replace(/\bAi\b/g, "AI").replace(/\bEu\b/g, "EU");

function lines(text: string): Line[] {
  const out: Line[] = [];
  let page = 1, start = 0;
  for (let i = 0; i <= text.length; i++) {
    const ch = text[i];
    if (i === text.length || ch === "\n" || ch === "\f") {
      const raw = text.slice(start, i);
      out.push({ text: raw.trim(), start, end: i, page });
      if (ch === "\f") page++;
      start = i + 1;
    }
  }
  return out;
}

export function looksLikeLegalAct(text: string) {
  return (text.match(/^\s*Article\s+\d+[a-z]*\s*$/gm) ?? []).length >= 10;
}

/** Words that occur whole inside lines, used to rejoin words the PDF split at a line break ("appli" + "cation"). */
function vocabulary(text: string) {
  const v = new Set<string>();
  for (const l of text.split(/\n|\f/)) {
    const words = l.toLowerCase().match(/[a-z]+/g) ?? [];
    for (let i = 1; i < words.length - 1; i++) v.add(words[i]);
  }
  return v;
}

/** Joins the lines of one unit into readable text: list items "(a)", "(i)" and "—" start new lines. */
function clean(ls: string[], vocab: Set<string>) {
  const kept = ls.filter((t) => t && !isNoise(t));
  let out = "";
  for (const t of kept) {
    if (!out) { out = t; continue; }
    if (/^(\(([a-z]{1,2}|[ivxl]+|\d+[a-z]?)\)|—|-|\d+[a-z]?\.)\s/.test(t)) { out += "\n" + t; continue; }
    const head = out.match(/([A-Za-z]+)(-?)$/), tail = t.match(/^([a-z]+)/);
    if (head && tail) {
      const joined = (head[1] + tail[1]).toLowerCase();
      if (vocab.has(joined) && (!vocab.has(head[1].toLowerCase()) || !vocab.has(tail[1]))) {
        out = (head[2] ? out.slice(0, -1) : out) + t; // a word split across lines
        continue;
      }
      if (head[2]) { out += t; continue; } // a real hyphenated word ("general-" + "purpose")
    }
    out += " " + t;
  }
  return out;
}

function contentType(articleTitle: string, text: string) {
  if (/definition/i.test(articleTitle)) return "DEFINITION";
  if (/\b(shall|must)\b|\bprohibited\b/i.test(text)) return "REQUIREMENT";
  if (/\bshould\b/i.test(text)) return "RECOMMENDATION";
  return "GUIDANCE";
}

export function parseLegalAct(text: string): ActStructure {
  const ls = lines(text);
  const vocab = vocabulary(text);
  const next = (i: number) => { let j = i + 1; while (j < ls.length && (!ls[j].text || isNoise(ls[j].text))) j++; return j; };
  const HEADING = /^(CHAPTER [IVXLC]+|SECTION \d+|Article \d+[a-z]*|ANNEX(?: [IVXLC]+)?)$/;
  /** Heading title from line j, including continuation lines (lower-case start, or more capitals for a chapter title). */
  const titleFrom = (j: number, caps: boolean) => {
    let title = ls[j]?.text ?? "", k = j;
    for (let n = next(k); n < ls.length; n = next(k)) {
      const t = ls[n].text;
      if (HEADING.test(t) || /^\d+[a-z]?\.\s/.test(t)) break;
      if (/^[a-z]/.test(t) || (caps && /[A-Z]/.test(t) && t === t.toUpperCase())) { title += " " + t; k = n; } else break;
    }
    return { title, last: k };
  };

  type Mark = { kind: "chapter" | "section" | "article" | "para" | "annex"; i: number; id: string; title: string; bodyFrom: number };
  const marks: Mark[] = [];
  let lastArticle: { n: number; s: string } | null = null, lastPara: { n: number; s: string } | null = null, lastAnnex = 0, inAnnexes = false;
  const after = (a: { n: number; s: string }, n: number, s: string, maxJump: number) => (n === a.n ? s > a.s : n > a.n && n <= a.n + maxJump);

  for (let i = 0; i < ls.length; i++) {
    const t = ls[i].text;
    if (!t || isNoise(t)) continue;
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^CHAPTER ([IVXLC]+)$/))) {
      const { title, last } = titleFrom(next(i), true);
      marks.push({ kind: "chapter", i, id: m[1], title, bodyFrom: last + 1 });
      i = last;
    } else if ((m = t.match(/^SECTION (\d+)$/i)) && !inAnnexes) {
      const { title, last } = titleFrom(next(i), false);
      marks.push({ kind: "section", i, id: m[1], title, bodyFrom: last + 1 });
      i = last;
    } else if ((m = t.match(/^Article (\d+)([a-z]*)$/)) && !inAnnexes) {
      const n = Number(m[1]);
      // Headings follow the article sequence; a cross-reference that wrapped onto its own line does not.
      if (lastArticle ? !after(lastArticle, n, m[2], 3) : n !== 1) continue;
      const { title, last } = titleFrom(next(i), false);
      marks.push({ kind: "article", i, id: `${n}${m[2]}`, title, bodyFrom: last + 1 });
      lastArticle = { n, s: m[2] }; lastPara = null;
      i = last;
    } else if ((m = t.match(/^ANNEX(?: ([IVXLC]+))?$/))) {
      const n = m[1] ? roman(m[1]) : 1;
      if (n <= lastAnnex) continue;
      const { title, last } = titleFrom(next(i), false);
      marks.push({ kind: "annex", i, id: m[1] ?? "", title, bodyFrom: last + 1 });
      lastAnnex = n; inAnnexes = true;
      i = last;
    } else if (lastArticle && !inAnnexes && (m = t.match(/^(\d+)([a-z]?)\.\s+\S/))) {
      const n = Number(m[1]);
      if (lastPara ? !after(lastPara, n, m[2], 3) : n !== 1) continue;
      marks.push({ kind: "para", i, id: `${n}${m[2]}`, title: "", bodyFrom: i });
      lastPara = { n, s: m[2] };
    }
  }

  const units: ActUnit[] = [];
  let chapter = "", section = "", article: Mark | null = null;
  const pathNow = () => [chapter, section].filter(Boolean);
  const body = (from: number, to: number) => clean(ls.slice(from, to).map((l) => l.text), vocab);
  const push = (identifier: string, title: string, parent: string | null, from: number, to: number) => {
    const text = body(from, to);
    if (!text) return;
    units.push({ identifier, title, path: pathNow(), parentIdentifier: parent, contentType: contentType(article?.title ?? title, text), text, pageNumber: ls[from]?.page ?? 1, start: ls[from]?.start ?? 0 });
  };

  for (let k = 0; k < marks.length; k++) {
    const mk = marks[k], end = marks[k + 1]?.i ?? ls.length;
    if (mk.kind === "chapter") { chapter = `Chapter ${mk.id} ${titleCase(mk.title)}`; section = ""; }
    else if (mk.kind === "section") section = `Section ${mk.id} ${mk.title}`;
    else if (mk.kind === "article") {
      article = mk;
      // An article without numbered paragraphs is one unit.
      if (marks[k + 1]?.kind !== "para") push(`Article ${mk.id}`, mk.title, null, mk.bodyFrom, end);
    } else if (mk.kind === "para" && article) {
      // The paragraph number is carried by the identifier ("Article 10(2)"), as in the library, not repeated in the text.
      const n = units.length;
      push(`Article ${article.id}(${mk.id})`, article.title, `Article ${article.id}`, mk.bodyFrom, end);
      if (units.length > n) units[n].text = units[n].text.replace(new RegExp(`^${mk.id}\\.\\s+`), "");
    }
    else if (mk.kind === "annex") { chapter = ""; section = ""; article = null; push(mk.id ? `Annex ${mk.id}` : "Annex", mk.title, null, mk.bodyFrom, end); }
  }

  const arts = marks.filter((m) => m.kind === "article").map((m) => Number(m.id.match(/^\d+/)![0]));
  const gaps: string[] = [];
  for (let n = 1; n < (arts.at(-1) ?? 0); n++) if (!arts.includes(n)) gaps.push(String(n));
  return { units, articles: arts.length, paragraphs: marks.filter((m) => m.kind === "para").length, annexes: marks.filter((m) => m.kind === "annex").length, articleGaps: gaps };
}

/** "02024R1689 — EN — 27.07.2026 — 001.001" on a EUR-Lex consolidated text: the consolidation it reflects. */
export function consolidationOf(text: string) {
  const m = text.slice(0, 4000).match(/(0\d{4}[A-Z]\d{4})\s+—\s+[A-Z]{2}\s+—\s+(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? { celex: m[1], date: `${m[4]}-${m[3]}-${m[2]}`, year: m[4] } : null;
}
