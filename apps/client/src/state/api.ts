/** Small fetch wrapper for the game API with a timeout. Never throws: returns a result object. */
export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

export async function api<T>(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<ApiResult<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 8000);
  try {
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    const res = await fetch(path, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: ctrl.signal,
      cache: 'no-store',
    });
    const type = res.headers.get('Content-Type') ?? '';
    // A static host without the Worker (e.g. vite preview) answers with HTML: treat as offline.
    if (!type.includes('application/json')) return { ok: false, status: 0, error: 'offline' };
    const data = (await res.json()) as T & { error?: string };
    return { ok: res.ok, status: res.status, data, error: res.ok ? undefined : data.error };
  } catch {
    return { ok: false, status: 0, error: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}
