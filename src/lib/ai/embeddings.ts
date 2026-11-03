// Text embeddings for semantic similarity between requirement texts (server-only; key from the environment).
import { AI_NOT_CONFIGURED, aiBaseUrl, aiKey, aiModelName } from "./openai";

const MODEL = () => aiModelName(process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small");

export async function embed(texts: string[]): Promise<number[][]> {
  const key = aiKey();
  if (!key) throw new Error(AI_NOT_CONFIGURED);
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 256) {
    const res = await fetch(`${aiBaseUrl()}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL(), input: texts.slice(i, i + 256).map((t) => t.slice(0, 6000) || " ") }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`Embedding request failed (${res.status}): ${j?.error?.message ?? res.statusText}`);
    out.push(...(j.data as { embedding: number[] }[]).map((d) => d.embedding));
  }
  return out;
}

export function cosine(a: number[], b: number[]) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}
