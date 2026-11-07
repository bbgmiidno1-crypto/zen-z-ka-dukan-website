import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface LiquidRailProps {
  children: ReactNode;
  /** Pixels per second of uninterrupted drift. Deliberately slow enough to inspect a piece. */
  speed?: number;
  /** Extra class names for the viewport. */
  className?: string;
  /** Accessible label for the rail region. */
  label?: string;
}

/**
 * A continuous right-to-left floating gallery.
 *
 * How it stays seamless: the product list is rendered twice and the track is translated by
 * `offset`, wrapped to one copy's width. When a card leaves on the left, its clone is already
 * entering on the right, so there is never a visible reset or a gap.
 *
 * How it stays usable:
 *  - drift slows to ~15% on hover, touch or keyboard focus instead of stopping dead;
 *  - dragging with a finger or mouse scrubs the rail and leaves momentum;
 *  - a click only navigates when the pointer did not actually drag (6px threshold);
 *  - movement is a single `translate3d` on one element, so the compositor does the work;
 *  - `prefers-reduced-motion` turns the rail into a normal, still, horizontal scroller.
 */
export function LiquidRail({ children, speed = 34, className = '', label = 'Floating product gallery' }: LiquidRailProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);
  const velocityRef = useRef(0);
  const halfWidthRef = useRef(0);
  const speedRef = useRef(speed);
  const interactionRef = useRef(0);
  const hoveringRef = useRef(false);
  const pauseRef = useRef(false);
  const dragRef = useRef<{ id: number; startX: number; lastX: number; moved: number } | null>(null);
  const [active, setActive] = useState(true);

  useEffect(() => { speedRef.current = speed; }, [speed]);

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    // Two identical copies live inside the track; one copy is the wrap distance.
    const half = track.scrollWidth / 2;
    halfWidthRef.current = half;
  }, []);

  useEffect(() => {
    const viewportElement = viewportRef.current;
    const trackElement = trackRef.current;
    if (!viewportElement || !trackElement) return;
    const viewport: HTMLDivElement = viewportElement;
    const track: HTMLDivElement = trackElement;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches) {
      setActive(false);
      viewport.dataset.liquid = 'reduced';
      return;
    }

    setActive(true);
    viewport.dataset.liquid = 'running';
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(track);

    let frame = 0;
    let last = performance.now();
    let visible = true;

    const visibility = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? true;
    }, { rootMargin: '120px' });
    visibility.observe(viewport);

    function tick(now: number): void {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (visible && !pauseRef.current) {
        const half = halfWidthRef.current;
        const dragging = dragRef.current !== null;
        const engaged = hoveringRef.current || performance.now() - interactionRef.current < 1200;

        // Hold still under the pointer/finger so a piece can actually be caught and tapped;
        // resume gently (never a jump) once the customer disengages.
        const target = dragging || engaged ? 0 : 1;
        const current = Number(viewport.dataset.speedFactor || '1');
        const nextFactor = current + (target - current) * Math.min(1, dt * 3.4);
        viewport.dataset.speedFactor = nextFactor.toFixed(3);

        if (!dragging) {
          offsetRef.current -= speedRef.current * nextFactor * dt;
        }

        // Momentum after a drag.
        if (Math.abs(velocityRef.current) > 0.5) {
          offsetRef.current += velocityRef.current * dt;
          velocityRef.current *= Math.pow(0.0009, dt);
        }

        if (half > 0) {
          // Wrap into (-half, 0] so the second copy always fills the right-hand side.
          while (offsetRef.current <= -half) offsetRef.current += half;
          while (offsetRef.current > 0) offsetRef.current -= half;
        }

        track.style.transform = `translate3d(${offsetRef.current.toFixed(2)}px, 0, 0)`;
      }

      frame = window.requestAnimationFrame(tick);
    }

    /* ------------------------------------------------------------- interactions */
    function slowDown(): void {
      interactionRef.current = performance.now();
    }

    function onPointerEnter(): void {
      hoveringRef.current = true;
      slowDown();
    }

    function onPointerLeave(): void {
      hoveringRef.current = false;
      slowDown();
    }

    function onFocusIn(): void {
      hoveringRef.current = true;
      slowDown();
    }

    function onFocusOut(): void {
      hoveringRef.current = false;
      slowDown();
    }

    function onPointerDown(event: PointerEvent): void {
      slowDown();
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      dragRef.current = { id: event.pointerId, startX: event.clientX, lastX: event.clientX, moved: 0 };
      velocityRef.current = 0;
    }

    function onPointerMove(event: PointerEvent): void {
      const drag = dragRef.current;
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.lastX;
      drag.lastX = event.clientX;
      drag.moved = Math.max(drag.moved, Math.abs(event.clientX - drag.startX));
      if (drag.moved > 6) {
        offsetRef.current += dx;
        velocityRef.current = -dx * 26;
      }
      slowDown();
    }

    function endDrag(event: PointerEvent): void {
      const drag = dragRef.current;
      if (!drag || drag.id !== event.pointerId) return;
      dragRef.current = null;
      slowDown();
      // A drag must never be treated as a click on a product card.
      if (drag.moved > 6) {
        const swallow = (clickEvent: MouseEvent) => {
          clickEvent.preventDefault();
          clickEvent.stopPropagation();
        };
        window.addEventListener('click', swallow, { capture: true, once: true });
        window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 60);
      }
    }

    function onVisibility(): void {
      pauseRef.current = document.visibilityState !== 'visible';
      last = performance.now();
    }

    viewport.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', endDrag, { passive: true });
    window.addEventListener('pointercancel', endDrag, { passive: true });
    viewport.addEventListener('pointerenter', onPointerEnter, { passive: true });
    viewport.addEventListener('pointerleave', onPointerLeave, { passive: true });
    viewport.addEventListener('focusin', onFocusIn);
    viewport.addEventListener('focusout', onFocusOut);
    viewport.addEventListener('wheel', slowDown, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onPointerLeave);

    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      visibility.disconnect();
      viewport.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      viewport.removeEventListener('pointerenter', onPointerEnter);
      viewport.removeEventListener('pointerleave', onPointerLeave);
      viewport.removeEventListener('focusin', onFocusIn);
      viewport.removeEventListener('focusout', onFocusOut);
      viewport.removeEventListener('wheel', slowDown);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onPointerLeave);
      delete viewport.dataset.speedFactor;
    };
  }, [measure]);

  return (
    <div
      ref={viewportRef}
      className={`liquid-rail ${className}`.trim()}
      data-active={active}
      role="region"
      aria-label={label}
    >
      <div ref={trackRef} className="liquid-track">
        <div className="liquid-copy">{children}</div>
        <div className="liquid-copy" aria-hidden="true">{children}</div>
      </div>
    </div>
  );
}
