// Minimal OpenAI Responses API client with strict JSON-schema output. Server-only: the API key is read
// from the environment (OPENAI_API_KEY) and never sent to the browser. Import from server code only.

const ENDPOINT = "https://api.openai.com/v1/responses";
export const AI_MODEL = () => process.env.OPENAI_MODEL || "gpt-6-luna";
export const aiConfigured = () => !!process.env.OPENAI_API_KEY;

export interface Usage { input: number; output: number; calls: number }
export const addUsage = (a: Usage | null | undefined, b: Usage): Usage => ({ input: (a?.input ?? 0) + b.input, output: (a?.output ?? 0) + b.output, calls: (a?.calls ?? 0) + b.calls });

export class AiError extends Error {}

/** One structured call: returns the parsed object that matches `schema`, plus token usage. */
export async function structured<T>(opts: { name: string; schema: Record<string, unknown>; instructions: string; input: string; timeoutMs?: number; file?: { name: string; data: string; mime: string } }): Promise<{ data: T; usage: Usage }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new AiError("AI is not configured: OPENAI_API_KEY is not set.");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 240_000);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL(),
        instructions: opts.instructions,
        // An attached file (e.g. a scanned PDF for OCR) is sent as base64 alongside the text input.
        input: opts.file ? [{ role: "user", content: [{ type: "input_file", filename: opts.file.name, file_data: `data:${opts.file.mime};base64,${opts.file.data}` }, { type: "input_text", text: opts.input }] }] : opts.input,
        store: false,
        text: { format: { type: "json_schema", name: opts.name, strict: true, schema: opts.schema } },
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new AiError(`AI request failed (${res.status}): ${body?.error?.message ?? res.statusText}`);
    if (body?.status !== "completed") throw new AiError(`AI response incomplete (${body?.status ?? "unknown"}${body?.incomplete_details?.reason ? `: ${body.incomplete_details.reason}` : ""}).`);
    const text = (body.output ?? []).flatMap((o: { content?: { type: string; text?: string }[] }) => o.content ?? []).find((c: { type: string }) => c.type === "output_text")?.text;
    if (!text) throw new AiError("AI response contained no output.");
    return { data: JSON.parse(text) as T, usage: { input: body.usage?.input_tokens ?? 0, output: body.usage?.output_tokens ?? 0, calls: 1 } };
  } catch (e) {
    if (e instanceof AiError) throw e;
    throw new AiError(e instanceof Error && e.name === "AbortError" ? "AI request timed out." : `AI request failed: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }
}
