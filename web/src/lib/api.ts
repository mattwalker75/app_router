/** JSON calls to the server. Errors carry the server's plain-English message. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly details?: unknown) { super(message); }
}

async function request<T>(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const isBlob = typeof Blob !== "undefined" && body instanceof Blob;
  const r = await fetch(url, {
    method,
    headers: { ...(body !== undefined && !isForm && !isBlob ? { "content-type": "application/json" } : {}), ...headers },
    body: body === undefined ? undefined : isForm || isBlob ? (body as BodyInit) : JSON.stringify(body),
  });
  const text = await r.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) {
    const d = data as { error?: string; details?: unknown } | null;
    if (r.status === 401) window.dispatchEvent(new CustomEvent("ar:signed-out"));
    throw new ApiError(d?.error || `Request failed (${r.status})`, r.status, d?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown, headers?: Record<string, string>) => request<T>("POST", url, body ?? {}, headers),
  put: <T>(url: string, body?: unknown) => request<T>("PUT", url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => request<T>("PATCH", url, body ?? {}),
  del: <T>(url: string, body?: unknown) => request<T>("DELETE", url, body),
};

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
