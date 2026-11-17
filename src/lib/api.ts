let currentCsrfToken: string | null = null;

export type DataChangeScope = 'marketplace' | 'auth' | 'seller' | 'admin' | 'all';
const DATA_CHANGED_EVENT = 'aidomart:data-changed';

export function emitDataChanged(scope: DataChangeScope = 'all') {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { scope } }));
  }
}

export function subscribeDataChanged(handler: (scope: DataChangeScope) => void) {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: Event) => {
    const scope = ((e as CustomEvent)?.detail?.scope || 'all') as DataChangeScope;
    handler(scope);
  };
  window.addEventListener(DATA_CHANGED_EVENT, listener);
  return () => window.removeEventListener(DATA_CHANGED_EVENT, listener);
}

export function setCsrfToken(token: string | null) {
  currentCsrfToken = token;
}

async function refreshCsrfTokenOnce(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/me', {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { csrfToken?: string | null };
    if (data.csrfToken) {
      currentCsrfToken = data.csrfToken;
      return data.csrfToken;
    }
  } catch {
    // ignore network error
  }
  return null;
}

function autoEmitForMutation(url: string, method: string) {
  if (method === 'GET') return;
  if (
    url.startsWith('/api/seller') ||
    url.startsWith('/api/admin') ||
    url.startsWith('/api/buyer/reviews')
  ) {
    emitDataChanged('marketplace');
  }
}

export async function apiRequest<T = any>(
  url: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
  } = {}
): Promise<T> {
  const method = options.method || 'GET';

  const execute = async () => {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (method !== 'GET' && currentCsrfToken) {
      headers['X-CSRF-Token'] = currentCsrfToken;
    }

    return fetch(url, {
      method,
      headers,
      credentials: 'include',
      cache: 'no-store',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  };

  let res = await execute();
  let data = await res.json().catch(() => ({}));

  if (
    res.status === 403 &&
    method !== 'GET' &&
    typeof data?.error === 'string' &&
    data.error.toLowerCase().includes('security token')
  ) {
    const refreshed = await refreshCsrfTokenOnce();
    if (refreshed) {
      res = await execute();
      data = await res.json().catch(() => ({}));
    }
  }

  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`) as Error & {
      status?: number;
      data?: any;
    };
    err.status = res.status;
    err.data = data;
    throw err;
  }

  autoEmitForMutation(url, method);
  return data as T;
}

export async function apiUpload<T = any>(url: string, formData: FormData): Promise<T> {
  const execute = async () => {
    const headers: Record<string, string> = {};
    if (currentCsrfToken) {
      headers['X-CSRF-Token'] = currentCsrfToken;
    }
    return fetch(url, {
      method: 'POST',
      headers,
      credentials: 'include',
      cache: 'no-store',
      body: formData,
    });
  };

  let res = await execute();
  let data = await res.json().catch(() => ({}));

  if (
    res.status === 403 &&
    typeof data?.error === 'string' &&
    data.error.toLowerCase().includes('security token')
  ) {
    const refreshed = await refreshCsrfTokenOnce();
    if (refreshed) {
      res = await execute();
      data = await res.json().catch(() => ({}));
    }
  }

  if (!res.ok) {
    throw new Error(data.error || `Upload failed (${res.status})`);
  }

  autoEmitForMutation(url, 'POST');
  return data as T;
}
