// The API origin is optional for ordinary same-origin deployments. It is a public
// URL, not a secret; an external server must separately permit the frontend
// origin and provide secure, working authentication and persistent storage.
const configuredOrigin = String(import.meta.env.VITE_API_ORIGIN || '').trim();

function parseApiOrigin(value: string): string {
  if (!value) return '';
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('VITE_API_ORIGIN must be an HTTPS origin without credentials or a path.');
  }
  return url.origin;
}

export const API_ORIGIN = parseApiOrigin(configuredOrigin);
const BASE = import.meta.env.BASE_URL;

export function apiEndpoint(path: string): string {
  return path.startsWith('/api/') ? `${API_ORIGIN}${path}` : path;
}

export function mediaUrl(path: string): string {
  if (!path.startsWith('/media/')) return path;
  // The project Pages artifact contains the complete bundled seed media under
  // its own prefix. Later uploads stay on the real backend/storage service.
  if (import.meta.env.MODE === 'github-pages' && path.startsWith('/media/seed/')) {
    return `${BASE}${path.slice(1)}`;
  }
  return API_ORIGIN ? `${API_ORIGIN}${path}` : path;
}

export const FALLBACK_IMAGE = mediaUrl('/media/seed/editorial/campaign.webp');

/** Rebase media paths in JSON responses, including gallery thumbnails and 360° frames. */
export function rebaseMediaInPayload(value: unknown): unknown {
  if (typeof value === 'string') return mediaUrl(value);
  if (Array.isArray(value)) return value.map(rebaseMediaInPayload);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rebaseMediaInPayload(child)]));
  }
  return value;
}
