import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const GUEST_KEY = 'zzkd.wishlist.guest';

interface WishlistContextValue {
  ids: Set<number>;
  count: number;
  /** True until the persisted wishlist (customer or device) has been read. */
  ready: boolean;
  /** Device-only hearts raised while signed out, to merge after login. */
  pendingGuestCount: number;
  has: (productId: number) => boolean;
  toggle: (productId: number) => Promise<boolean>;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

function readGuest(): number[] {
  try {
    const raw = window.localStorage.getItem(GUEST_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is number => Number.isInteger(value)) : [];
  } catch {
    return [];
  }
}

function writeGuest(ids: number[]): void {
  try {
    window.localStorage.setItem(GUEST_KEY, JSON.stringify(ids));
  } catch {
    // Storage can be unavailable in private modes; the in-memory state still works.
  }
}

/**
 * Wishlist state for the storefront.
 *
 * Signed in  → SQLite via /api/customer/wishlist (survives devices and restarts).
 * Signed out → localStorage, and any hearts raised as a guest are merged into the
 *              account the moment the customer signs in.
 */
export function WishlistProvider({ children }: { children: ReactNode }) {
  const { customer, loading } = useAuth();
  const [ids, setIds] = useState<Set<number>>(() => new Set());
  const [ready, setReady] = useState(false);
  const [guestOnly, setGuestOnly] = useState<number[]>([]);

  // Merge device hearts into the account once a customer session exists.
  useEffect(() => {
    if (loading) return;
    let cancelled = false;

    async function sync(): Promise<void> {
      if (!customer) {
        const guest = readGuest();
        if (cancelled) return;
        setIds(new Set(guest));
        setGuestOnly(guest);
        setReady(true);
        return;
      }

      const guest = readGuest();
      try {
        if (guest.length) {
          await Promise.all(guest.map((productId) =>
            api.post('/api/customer/wishlist', { productId }).catch(() => undefined)));
          writeGuest([]);
        }
        const data = await api.get<{ productIds: number[] }>('/api/customer/wishlist');
        if (cancelled) return;
        setIds(new Set(data.productIds));
        setGuestOnly([]);
      } catch (error) {
        if (!cancelled) {
          console.warn('Wishlist sync failed:', errorMessage(error));
          setIds(new Set(guest));
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void sync();
    return () => { cancelled = true; };
  }, [customer, loading]);

  const toggle = useCallback(async (productId: number): Promise<boolean> => {
    const wanted = !ids.has(productId);

    // Optimistic update: the heart responds immediately, then reconciles with the server.
    setIds((current) => {
      const next = new Set(current);
      if (wanted) next.add(productId);
      else next.delete(productId);
      return next;
    });

    if (!customer) {
      setGuestOnly((current) => {
        const next = wanted ? [...new Set([...current, productId])] : current.filter((id) => id !== productId);
        writeGuest(next);
        return next;
      });
      return wanted;
    }

    try {
      const data = wanted
        ? await api.post<{ productIds: number[] }>('/api/customer/wishlist', { productId })
        : await api.delete<{ productIds: number[] }>(`/api/customer/wishlist/${productId}`);
      setIds(new Set(data.productIds));
      return wanted;
    } catch (error) {
      console.warn('Wishlist update failed:', errorMessage(error));
      setIds((current) => {
        const next = new Set(current);
        if (wanted) next.delete(productId);
        else next.add(productId);
        return next;
      });
      return !wanted;
    }
  }, [customer, ids]);

  const value = useMemo<WishlistContextValue>(() => ({
    ids,
    count: ids.size,
    ready,
    pendingGuestCount: customer ? 0 : guestOnly.length,
    has: (productId: number) => ids.has(productId),
    toggle,
  }), [ids, ready, customer, guestOnly, toggle]);

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistContextValue {
  const context = useContext(WishlistContext);
  if (!context) throw new Error('useWishlist must be used inside WishlistProvider');
  return context;
}
