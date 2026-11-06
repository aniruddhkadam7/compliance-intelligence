export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

async function parse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") window.location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`, body.details);
  }
  return body as T;
}

/** Reads give up after 90 s so a stuck request surfaces as an error (with a retry) instead of an endless spinner. */
export const apiGet = <T>(url: string, signal?: AbortSignal) =>
  fetch(url, { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000) })
    .catch((e: unknown) => {
      if (e instanceof DOMException && e.name === "TimeoutError") throw new ApiError(504, "The server took too long to respond.");
      throw e;
    })
    .then((r) => parse<T>(r));

export const apiSend = <T>(url: string, body?: unknown, method = "POST") =>
  fetch(url, {
    method,
    headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => parse<T>(r));

/** Builds a query string, dropping empty values. */
export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}
