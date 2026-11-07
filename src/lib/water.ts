/**
 * Shared water helpers: device capability tiers, ripple math and a tiny event bus used to
 * trigger a splash from anywhere in the app (product clicks, navigation) without prop drilling.
 *
 * The palette is intentionally not "swimming pool blue": the surface is espresso and mocha
 * liquid with burnt-amber depth and champagne-gold specular highlights.
 */

export type WaterTier = 'off' | 'lite' | 'full';

export const WATER_PALETTE = {
  abyss: '#080604',
  espresso: '#1b120b',
  mocha: '#3a2a1d',
  amber: '#a2632a',
  gold: '#e8d09a',
  cream: '#f4ead8',
} as const;

type NavigatorWithHints = Navigator & {
  deviceMemory?: number;
};

let cachedTier: WaterTier | null = null;

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Decide how expensive the water surface may be.
 *  - off  : reduced motion, no WebGL, or a device we do not trust to keep 60 fps.
 *  - lite : phones/tablets and low-core desktops → fewer ripples, lower resolution, no blur.
 *  - full : desktop with a fine pointer and enough cores/memory.
 */
export function detectWaterTier(force?: WaterTier): WaterTier {
  if (force) return force;
  if (cachedTier) return cachedTier;
  if (typeof window === 'undefined') return 'off';
  // Quality-assurance hook: interaction timing is verified with the shader switched off so the
  // software-rendered test browser is not GPU-bound. Real customers never set this attribute.
  if ((window as Window & { __zzkdWaterOff?: boolean }).__zzkdWaterOff === true) return 'off';
  if (prefersReducedMotion()) {
    cachedTier = 'off';
    return cachedTier;
  }

  const nav = navigator as NavigatorWithHints;
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const cores = nav.hardwareConcurrency || 4;
  const memory = nav.deviceMemory || 4;
  const narrow = window.innerWidth < 900;

  cachedTier = coarse || narrow || cores <= 4 || memory <= 4 ? 'lite' : 'full';
  return cachedTier;
}

export function hasWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return false;
    const lose = (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context');
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ ripple pool */

export interface Ripple {
  /** Normalised coordinates inside the surface (0..1). */
  x: number;
  y: number;
  /** Seconds since the ripple started. */
  age: number;
  strength: number;
  /** Wave speed multiplier, so overlapping ripples never look synchronised. */
  speed: number;
}

export const MAX_RIPPLES = 10;

export function makeRipple(x: number, y: number, strength = 1): Ripple {
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
    age: 0,
    strength: Math.min(1.6, Math.max(0.15, strength)),
    speed: 0.86 + Math.random() * 0.28,
  };
}

/* ------------------------------------------------------------------ splash bus */

export type SplashListener = (event: { x: number; y: number; strength: number; kind: 'pointer' | 'splash' }) => void;

const splashListeners = new Set<SplashListener>();

export function onWaterSplash(listener: SplashListener): () => void {
  splashListeners.add(listener);
  return () => { splashListeners.delete(listener); };
}

/** Fire a splash in viewport coordinates (clientX/clientY). Used by product/droplet clicks. */
export function requestWaterSplash(clientX: number, clientY: number, strength = 1.35): void {
  if (typeof window === 'undefined') return;
  const width = window.innerWidth || 1;
  const height = window.innerHeight || 1;
  const event = {
    x: clientX / width,
    y: clientY / height,
    strength,
    kind: 'splash' as const,
  };
  splashListeners.forEach((listener) => listener(event));
}
