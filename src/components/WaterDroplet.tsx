import { useCallback, useEffect, useRef, useState } from 'react';
import { requestWaterSplash } from '@/lib/water';

interface DropletState {
  /** Viewport coordinates of the impact point. */
  x: number;
  y: number;
  key: number;
}

/**
 * The product-click droplet.
 *
 * A teardrop of liquid amber falls from above the viewport, lands exactly on the clicked
 * product, throws a short liquid crown + splash ring, and the page transition begins while
 * the droplet is still settling. It is pure DOM/CSS (no WebGL context), so it works on every
 * device and never competes with the background surface for GPU time.
 */
export function WaterDroplet() {
  const [droplet, setDroplet] = useState<DropletState | null>(null);
  const timerRef = useRef<number | null>(null);

  const strike = useCallback((x: number, y: number) => {
    setDroplet({ x, y, key: Date.now() });
    requestWaterSplash(x, y, 1.5);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setDroplet(null), 1150);
  }, []);

  useEffect(() => {
    function handleClick(event: MouseEvent): void {
      // Capture phase: React Router's <Link> calls preventDefault during bubbling, so by the time
      // a bubble-phase listener runs the navigation is already "prevented". Listening in capture
      // means the droplet fires for real product clicks without interfering with routing.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target instanceof Element ? event.target : null;
      // Wishlist hearts, 360 buttons and anything else opting out keep their normal click.
      if (target?.closest('[data-no-water-drop]')) return;
      const card = target?.closest<HTMLElement>('[data-water-drop]');
      if (!card) return;

      // The product itself reacts with a brief liquid distortion while the page transitions.
      card.classList.remove('water-hit');
      void card.offsetWidth;
      card.classList.add('water-hit');
      window.setTimeout(() => card.classList.remove('water-hit'), 700);
      // Let the browser (and Playwright) see a normal, immediate navigation.
      strike(event.clientX, event.clientY || card.getBoundingClientRect().top + 24);
    }

    document.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [strike]);

  if (!droplet) return null;

  // Distance the droplet falls so it appears to come from above the fold.
  const fallFrom = Math.min(window.innerHeight, droplet.y + 320);

  return (
    <div className="water-droplet-layer" aria-hidden="true">
      <div
        key={droplet.key}
        className="water-droplet"
        style={{
          left: `${droplet.x}px`,
          top: `${droplet.y}px`,
          // Custom properties drive the keyframes without re-rendering React.
          ['--drop-from' as string]: `${-fallFrom}px`,
        }}
      >
        <span className="water-droplet-body" />
        <span className="water-droplet-impact" />
        <span className="water-droplet-ring" />
        <span className="water-droplet-ring water-droplet-ring-2" />
        <span className="water-droplet-crown" />
      </div>
    </div>
  );
}
