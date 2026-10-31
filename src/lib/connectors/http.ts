import { createHash } from "node:crypto";

const UA = "ComplianceIntelligence/0.1 (+framework update monitor; contact: platform owner)";

export class ConnectorError extends Error {
  constructor(message: string, public httpStatus?: number) {
    super(message);
  }
}

export async function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 45_000, ...rest } = init;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: ctrl.signal, cache: "no-store", headers: { "User-Agent": UA, ...(rest.headers ?? {}) } });
  } catch (e) {
    throw new ConnectorError(e instanceof Error && e.name === "AbortError" ? `Timed out after ${timeoutMs / 1000}s` : `Network error: ${(e as Error).message}`);
  } finally {
    clearTimeout(t);
  }
}

export async function fetchJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const res = await fetchWithTimeout(url, { ...init, headers: { Accept: "application/json", ...(init.headers ?? {}) } });
  if (res.status === 304) return { res, data: null as T | null, text: "" };
  if (!res.ok) throw new ConnectorError(`HTTP ${res.status} from ${new URL(url).host}`, res.status);
  const text = await res.text();
  try {
    return { res, data: JSON.parse(text) as T, text };
  } catch {
    throw new ConnectorError("Response was not valid JSON", res.status);
  }
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Hash of a value with object keys sorted, so formatting changes do not register as content changes. */
export function stableHash(value: unknown) {
  const norm = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(norm) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, norm((v as Record<string, unknown>)[k])])) : v;
  return sha256(JSON.stringify(norm(value)));
}

/** Diff two id→hash maps. */
export function diffMaps(prev: Record<string, string>, next: Record<string, string>) {
  const added = Object.keys(next).filter((k) => !(k in prev));
  const removed = Object.keys(prev).filter((k) => !(k in next));
  const modified = Object.keys(next).filter((k) => k in prev && prev[k] !== next[k]);
  return { added, removed, modified };
}
