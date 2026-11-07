import { useLayoutEffect, type RefObject } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * The original cinematic motion language is preserved. Gold visuals are kept
 * small and low-intensity, while scroll distance, reveals and depth are
 * restored to an elegant, premium level.
 */
export const LUXURY_MOTION = {
  click: 0.19,
  hover: 0.26,
  reveal: 0.7,
  transition: 0.34,
  ease: 'power2.out',
} as const;

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function deviceProfile() {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  return {
    coarsePointer: typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
    cores: (nav?.hardwareConcurrency || 8),
    memory: ((nav as Navigator & { deviceMemory?: number })?.deviceMemory || 8),
  };
}

export function supportsRichMotion(): boolean {
  return typeof window !== 'undefined' && !prefersReducedMotion();
}

export function supportsDesktopMotion(): boolean {
  const { coarsePointer, cores, memory } = deviceProfile();
  return supportsRichMotion() && !coarsePointer && cores > 4 && memory >= 4 && window.innerWidth >= 768;
}

export function supportsThreeD(): boolean {
  const { coarsePointer, cores, memory } = deviceProfile();
  return supportsRichMotion() && !coarsePointer && cores > 4 && memory >= 4;
}

export function useHomeAnimations(rootRef: RefObject<HTMLElement | null>, active: boolean): void {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!active || !root || !supportsRichMotion()) return;
    const mm = gsap.matchMedia();
    const { coarsePointer } = deviceProfile();
    const mobileFactor = coarsePointer ? 0.62 : 1;

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const reveals = gsap.utils.toArray<HTMLElement>('.reveal', root);
      reveals.forEach((element, index) => {
        gsap.from(element, {
          opacity: 0,
          y: 20 * mobileFactor,
          duration: LUXURY_MOTION.reveal,
          ease: LUXURY_MOTION.ease,
          delay: (index % 4) * 0.028,
          scrollTrigger: { trigger: element, start: 'top 90%', once: true },
        });
      });

      const letters = gsap.utils.toArray<HTMLElement>('.brand-letter', root);
      if (letters.length) {
        gsap.from(letters, {
          yPercent: 52,
          opacity: 0,
          rotateX: -30,
          stagger: 0.028,
          duration: 0.78,
          ease: 'power3.out',
          scrollTrigger: { trigger: '.brand-typography', start: 'top 78%', once: true },
        });
      }

      gsap.utils.toArray<HTMLElement>('.gold-rule', root).forEach((rule) => {
        gsap.from(rule, {
          scaleX: 0.15,
          transformOrigin: 'left center',
          duration: 0.85,
          ease: LUXURY_MOTION.ease,
          scrollTrigger: { trigger: rule, start: 'top 92%', once: true },
        });
      });
    });

    mm.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
      if (!supportsDesktopMotion()) return;

      const heroMedia = root.querySelector<HTMLElement>('.hero-media');
      if (heroMedia) {
        gsap.fromTo(
          heroMedia,
          { yPercent: -1.5, scale: 1.045 },
          {
            yPercent: 5.5,
            scale: 1.1,
            ease: 'none',
            scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 1 },
          },
        );
      }

      gsap.utils.toArray<HTMLElement>('.scroll-rail', root).forEach((section) => {
        const track = section.querySelector<HTMLElement>('.rail-track');
        if (!track) return;
        const direction = section.dataset.direction === 'right' ? 1 : -1;
        gsap.fromTo(
          track,
          { xPercent: direction * 5.5 },
          {
            xPercent: direction * -4,
            ease: 'none',
            scrollTrigger: {
              trigger: section,
              start: 'top 88%',
              end: 'bottom 18%',
              scrub: 1,
              invalidateOnRefresh: true,
            },
          },
        );
      });

      gsap.utils.toArray<HTMLElement>('.editorial-image', root).forEach((image) => {
        gsap.fromTo(
          image,
          { y: 38, scale: 1.045 },
          {
            y: -32,
            scale: 1.09,
            ease: 'none',
            scrollTrigger: { trigger: image, start: 'top bottom', end: 'bottom top', scrub: 1 },
          },
        );
      });
    });

    const refreshTimer = window.setTimeout(() => ScrollTrigger.refresh(), 600);
    return () => {
      window.clearTimeout(refreshTimer);
      mm.revert();
    };
  }, [active, rootRef]);
}

export function usePageTransition(
  pathname: string,
  contentRef: RefObject<HTMLElement | null>,
  curtainRef: RefObject<HTMLDivElement | null>,
): void {
  useLayoutEffect(() => {
    const content = contentRef.current;
    const curtain = curtainRef.current;
    if (!content || !curtain) return;

    if (!supportsRichMotion()) {
      gsap.set(content, { clearProps: 'all', opacity: 1, y: 0 });
      gsap.set(curtain, { scaleX: 0, autoAlpha: 0 });
      return;
    }

    // A dark cinematic curtain with only a small centered gold hairline.
    const timeline = gsap.timeline();
    timeline
      .set(curtain, { scaleX: 0, transformOrigin: 'left center', autoAlpha: 1 })
      .set(content, { opacity: 0.94, y: 10 })
      .to(curtain, { scaleX: 1, duration: 0.26, ease: 'power2.inOut' })
      .to(content, { opacity: 1, y: 0, duration: 0.42, ease: LUXURY_MOTION.ease }, '-=0.06')
      .to(curtain, { scaleX: 0, transformOrigin: 'right center', duration: 0.38, ease: 'power2.inOut' }, '-=0.20')
      .set(curtain, { autoAlpha: 0 });

    return () => {
      timeline.kill();
    };
  }, [pathname, contentRef, curtainRef]);
}
