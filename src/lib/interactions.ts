import { useEffect } from 'react';

const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  '[role="button"]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  'label',
  '.product-card',
  '.product-media',
  '.category-card',
  '.collection-card',
  '.gallery-main',
  '.gallery-thumb',
  '.color-swatch',
  '.size-button',
  '.filter-chip',
  '.filter-side-link',
  '.saved-address',
  '.order-card',
  '.admin-nav-link',
  '.admin-flag',
  '.icon-btn',
  '.text-link',
  '.btn',
  '.nav-link',
  '.upload-drop',
].join(',');

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function interactiveTarget(candidate: EventTarget | null): Element | null {
  if (!(candidate instanceof Element)) return null;
  const target = candidate.closest(INTERACTIVE_SELECTOR);
  if (!target || target.closest('[data-no-luxury-interaction]')) return null;
  if (target.matches(':disabled, [aria-disabled="true"]')) return null;
  return target;
}

/**
 * A single delegated interaction layer. It never prevents default behavior,
 * never delays navigation and never announces routes; it only adds a tiny
 * metallic-gold ripple and a brief 0.97 press state.
 */
export function useLuxuryInteractions(): void {
  useEffect(() => {
    let pressedTarget: Element | null = null;

    function release(): void {
      pressedTarget?.classList.remove('zzkd-pressed');
      pressedTarget = null;
    }

    function activate(target: Element, clientX?: number, clientY?: number): void {
      if (reducedMotion()) return;
      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const x = Number.isFinite(clientX) ? clientX! : rect.left + rect.width / 2;
      const y = Number.isFinite(clientY) ? clientY! : rect.top + rect.height / 2;
      const size = Math.max(14, Math.min(30, Math.min(rect.width, rect.height) * 0.28 || 20));

      const ripple = document.createElement('span');
      ripple.className = 'zzkd-ripple';
      ripple.setAttribute('aria-hidden', 'true');
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
      ripple.style.left = `${x - size / 2}px`;
      ripple.style.top = `${y - size / 2}px`;
      document.body.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
      window.setTimeout(() => ripple.remove(), 260);

      release();
      pressedTarget = target;
      target.classList.add('zzkd-pressed');
      // Hold the pressed state long enough that the 110ms scale always completes, even when the
      // device is dropping frames; the press then eases back out on its own.
      window.setTimeout(() => {
        if (pressedTarget === target) release();
      }, 340);
    }

    function handlePointerDown(event: PointerEvent): void {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const target = interactiveTarget(event.target);
      if (target) activate(target, event.clientX, event.clientY);
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = interactiveTarget(event.target);
      if (!target) return;
      if (
        target instanceof HTMLInputElement
        && ['text', 'email', 'password', 'search', 'tel', 'number', 'url'].includes(target.type)
        && event.key === ' '
      ) return;
      activate(target);
    }

    function handleKeyUp(event: KeyboardEvent): void {
      if (event.key === 'Enter' || event.key === ' ') release();
    }

    document.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', release);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('blur', release);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      release();
      document.querySelectorAll('.zzkd-ripple').forEach((ripple) => ripple.remove());
    };
  }, []);
}
