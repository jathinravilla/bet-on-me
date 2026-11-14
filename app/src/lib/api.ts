const BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;
export const setToken = (t: string | null) => {
  token = t;
};
export const setOnUnauthorized = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

export async function api<T>(path: string, opts: { method?: 'GET' | 'POST'; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  if (!BASE) throw new ApiError(0, 'The app is not pointed at a server yet (EXPO_PUBLIC_API_URL is missing).');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 45_000);
  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiError(0, ctrl.signal.aborted ? 'That took too long. Check your connection and try again.' : "Can't reach the server. Check your connection.");
  } finally {
    clearTimeout(timer);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.();
    const msg = (data as { error?: string } | null)?.error;
    throw new ApiError(res.status, msg || 'Something went wrong. Try again.');
  }
  return data as T;
}

/** PUT a recorded file straight to storage with progress (0..1). Returns the stored file's URL. */
export function uploadFile(uri: string, uploadUrl: string, headers: Record<string, string>, onProgress: (p: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    (async () => {
      const blob = await (await fetch(uri)).blob();
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onerror = () => reject(new ApiError(0, 'Upload failed. Check your connection and try again.'));
      xhr.ontimeout = () => reject(new ApiError(0, 'Upload timed out. Try again.'));
      xhr.timeout = 120_000;
      xhr.onload = () => {
        try {
          const url = (JSON.parse(xhr.responseText) as { url?: string }).url;
          if (xhr.status >= 200 && xhr.status < 300 && url) return resolve(url);
        } catch {
          /* fall through */
        }
        reject(new ApiError(xhr.status, 'Upload failed. Try recording again.'));
      };
      xhr.send(blob);
    })().catch(() => reject(new ApiError(0, "Couldn't read the recording. Try again.")));
  });
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');
