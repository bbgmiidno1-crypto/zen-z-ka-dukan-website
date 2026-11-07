import { ORDER_STATUSES, type OrderStatus } from '@shared/types';

export function formatINR(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(timestamp));
}

export function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export function statusIndex(status: OrderStatus): number {
  return ORDER_STATUSES.indexOf(status);
}

export function isTerminalStatus(status: OrderStatus): boolean {
  return status === 'Delivered' || status === 'Cancelled';
}

export function checkoutPath(productSlug: string, variantId: number, sizeId: number, quantity = 1): string {
  const params = new URLSearchParams({
    product: productSlug,
    variant: String(variantId),
    size: String(sizeId),
    qty: String(quantity),
  });
  return `/checkout?${params.toString()}`;
}

export function nextParam(path: string): string {
  return encodeURIComponent(path);
}

export function safeNext(value: string | null, fallback = '/'): string {
  if (!value) return fallback;
  // useSearchParams already decodes query values. Accept only local absolute paths.
  if (value.startsWith('/') && !value.startsWith('//') && !/[\r\n]/.test(value)) return value;
  return fallback;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
