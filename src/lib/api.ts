export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code = 'api_error',
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type QueryValue = string | number | boolean | null | undefined;

// Preview-only fallback for embedded browsers that do not return any cookies.
// Deliberately kept in module memory: never localStorage, sessionStorage or URLs.
let previewAdminSession: string | null = null;
export function setPreviewAdminSession(token: string | null): void {
  previewAdminSession = token;
}

function buildUrl(path: string, params?: Record<string, QueryValue>): string {
  if (!params) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}${path.includes('?') ? '&' : '?'}${query}` : path;
}

function validationMessage(details: unknown): string | null {
  if (!details || typeof details !== 'object') return null;
  const fieldErrors = (details as { fieldErrors?: Record<string, unknown> }).fieldErrors;
  if (!fieldErrors) return null;
  for (const value of Object.values(fieldErrors)) {
    if (Array.isArray(value) && value.length) return String(value[0]);
  }
  return null;
}

async function request<T>(path: string, init: RequestInit = {}, params?: Record<string, QueryValue>): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('X-ZZKD-Client', '1');
  if (previewAdminSession && (path === '/api/auth/session' || path.startsWith('/api/admin/'))) {
    headers.set('X-ZZKD-Admin-Preview-Session', previewAdminSession);
  }
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (init.body && !isForm && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), {
      ...init,
      credentials: 'include',
      cache: path.startsWith('/api/auth/') || path.startsWith('/api/admin/') || path.startsWith('/api/customer/') ? 'no-store' : init.cache,
      headers,
    });
  } catch {
    throw new ApiError('Unable to reach ZEN Z KA DUKAN. Please check your connection.', 0, 'network');
  }
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const body = typeof payload === 'object' && payload ? (payload as Record<string, unknown>) : {};
    const message = validationMessage(body.details) || String(body.error || 'Something went wrong. Please try again.');
    throw new ApiError(message, response.status, String(body.code || 'api_error'), body.details);
  }
  return payload as T;
}

function jsonBody(body: unknown): string | undefined {
  return body === undefined ? undefined : JSON.stringify(body);
}

export const api = {
  get: <T>(path: string, params?: Record<string, QueryValue>) => request<T>(path, { method: 'GET' }, params),
  post: <T>(path: string, body?: unknown, headers?: HeadersInit) => request<T>(path, { method: 'POST', body: jsonBody(body), headers }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: jsonBody(body) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: jsonBody(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, form: FormData, method: 'POST' | 'PUT' = 'POST') =>
    request<T>(path, { method, body: form }),
};

export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}
