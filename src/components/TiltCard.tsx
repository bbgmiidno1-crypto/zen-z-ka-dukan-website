import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { prefersReducedMotion, supportsDesktopMotion } from '@/lib/motion';

const MAX_TILT_X = 4.2;
const MAX_TILT_Y = 4.9;

export function TiltCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  const [resetting, setResetting] = useState(false);
  const frame = useRef<number | null>(null);

  function handleMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || prefersReducedMotion() || !supportsDesktopMotion()) return;
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      target.style.setProperty('--rx', `${(-y * MAX_TILT_X).toFixed(2)}deg`);
      target.style.setProperty('--ry', `${(x * MAX_TILT_Y).toFixed(2)}deg`);
    });
    setResetting(false);
  }

  function handleLeave(event: PointerEvent<HTMLDivElement>) {
    if (frame.current) cancelAnimationFrame(frame.current);
    event.currentTarget.style.setProperty('--rx', '0deg');
    event.currentTarget.style.setProperty('--ry', '0deg');
    setResetting(true);
  }

  return (
    <div
      className={`tilt-card ${resetting ? 'is-resetting' : ''} ${className}`}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      {children}
    </div>
  );
}
