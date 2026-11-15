let currentCsrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  currentCsrfToken = token;
}

async function refreshCsrfTokenOnce(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
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
  return data as T;
}
