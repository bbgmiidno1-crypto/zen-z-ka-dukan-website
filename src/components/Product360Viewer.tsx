import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Box,
  ChevronLeft,
  ChevronRight,
  Images,
  Maximize2,
  Minimize2,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Product360Sequence } from '@shared/types';
import { clamp, wrapFrame, type ViewerCommand, type ViewerCommandType } from '@/lib/viewer';

const Model3DViewer = lazy(() => import('@/components/Model3DViewer'));

interface Product360ViewerProps {
  productName: string;
  variantName: string;
  sequence: Product360Sequence | null;
  onClose: () => void;
}

interface PointerPoint {
  x: number;
  y: number;
}

export function Product360Viewer({ productName, variantName, sequence, onClose }: Product360ViewerProps) {
  const [mode, setMode] = useState<'sequence' | 'model'>('sequence');
  const [frame, setFrame] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [command, setCommand] = useState<ViewerCommand | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');
  const [modelError, setModelError] = useState('');
  const nonce = useRef(0);
  const viewerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  const zoomRef = useRef(1);
  const pointers = useRef(new Map<number, PointerPoint>());
  const dragStart = useRef<{ x: number; startFrame: number } | null>(null);
  const pinchStart = useRef<{ distance: number; startZoom: number } | null>(null);

  const frameCount = sequence?.images.length ?? 0;
  const currentImage = sequence?.images[frame % Math.max(1, frameCount)];
  const hasModel = Boolean(sequence?.modelPath);

  useEffect(() => {
    frameRef.current = frame;
  }, [frame]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    viewerRef.current?.focus();
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    const update = () => setIsFullscreen(document.fullscreenElement === viewerRef.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  useEffect(() => {
    setMode('sequence');
    setFrame(0);
    frameRef.current = 0;
    setZoom(1);
    zoomRef.current = 1;
    setModelError('');
  }, [sequence?.id]);

  useEffect(() => {
    if (!sequence || mode !== 'sequence' || frameCount <= 0) return;
    [-2, -1, 1, 2].forEach((offset) => {
      const image = sequence.images[wrapFrame(frame + offset, frameCount)];
      const preload = new Image();
      preload.decoding = 'async';
      preload.src = image.path;
    });
  }, [frame, frameCount, mode, sequence]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || mode !== 'sequence' || !sequence) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((current) => {
        const next = clamp(current - event.deltaY * 0.0015, 1, 2.5);
        zoomRef.current = next;
        return next;
      });
    };
    stage.addEventListener('wheel', handleWheel, { passive: false });
    return () => stage.removeEventListener('wheel', handleWheel);
  }, [mode, sequence]);

  function sendCommand(type: ViewerCommandType) {
    nonce.current += 1;
    setCommand({ type, nonce: nonce.current });
  }

  useEffect(() => {
    if (!command || mode !== 'sequence') return;
    if (command.type === 'rotateLeft') {
      const next = wrapFrame(frameRef.current - 1, frameCount);
      frameRef.current = next;
      setFrame(next);
    } else if (command.type === 'rotateRight') {
      const next = wrapFrame(frameRef.current + 1, frameCount);
      frameRef.current = next;
      setFrame(next);
    } else if (command.type === 'zoomIn') {
      setZoom((current) => {
        const next = clamp(current + 0.2, 1, 2.5);
        zoomRef.current = next;
        return next;
      });
    } else if (command.type === 'zoomOut') {
      setZoom((current) => {
        const next = clamp(current - 0.2, 1, 2.5);
        zoomRef.current = next;
        return next;
      });
    } else if (command.type === 'reset') {
      frameRef.current = 0;
      setFrame(0);
      zoomRef.current = 1;
      setZoom(1);
    }
  }, [command, frameCount, mode]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      // Escape leaves fullscreen first; a second Escape closes the viewer.
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      else onClose();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      sendCommand('rotateLeft');
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      sendCommand('rotateRight');
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      sendCommand('zoomIn');
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      sendCommand('zoomOut');
    } else if (event.key === '0' || event.key.toLowerCase() === 'r') {
      event.preventDefault();
      sendCommand('reset');
    } else if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      void toggleFullscreen();
    }
  }

  async function toggleFullscreen() {
    const element = viewerRef.current;
    if (!element) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await element.requestFullscreen();
      setFullscreenError('');
    } catch {
      setFullscreenError('Fullscreen is unavailable in this browser.');
    }
  }

  function pointerDistance(): number {
    const [first, second] = [...pointers.current.values()];
    return first && second ? Math.hypot(first.x - second.x, first.y - second.y) : 0;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!sequence || mode !== 'sequence' || frameCount <= 0) return;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Synthetic and unsupported pointers still drag. */ }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      dragStart.current = { x: event.clientX, startFrame: frameRef.current };
      pinchStart.current = null;
    } else if (pointers.current.size === 2) {
      dragStart.current = null;
      pinchStart.current = { distance: pointerDistance(), startZoom: zoomRef.current };
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous || !sequence || mode !== 'sequence') return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1 && dragStart.current) {
      const steps = Math.round((event.clientX - dragStart.current.x) / 22);
      const next = wrapFrame(dragStart.current.startFrame - steps, frameCount);
      frameRef.current = next;
      setFrame(next);
    } else if (pointers.current.size >= 2 && pinchStart.current) {
      const distance = pointerDistance();
      const startDistance = pinchStart.current.distance || 1;
      const next = clamp(pinchStart.current.startZoom * (distance / startDistance), 1, 2.5);
      zoomRef.current = next;
      setZoom(next);
    }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (pointers.current.size === 0) {
      dragStart.current = null;
      pinchStart.current = null;
    } else if (pointers.current.size === 1) {
      const [point] = [...pointers.current.values()];
      dragStart.current = { x: point.x, startFrame: frameRef.current };
      pinchStart.current = null;
    }
  }

  // The viewer is portalled to <body> so no page layer (sticky navbar, transformed hero or
  // GSAP-driven sections) can clamp its fixed positioning or paint above it.
  return createPortal(
    <div
      className="viewer-overlay"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        ref={viewerRef}
        className="viewer-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`360 degree viewer for ${productName}`}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className="viewer-header">
          <div>
            <div className="eyebrow">Interactive 360° viewer · {variantName}</div>
            <h2>{productName}</h2>
          </div>
          <button className="viewer-close" type="button" onClick={onClose} aria-label="Close 360 degree viewer"><X size={18} /></button>
        </div>

        <div className="viewer-main">
          <div
            ref={stageRef}
            className="viewer-stage"
            aria-label="Drag horizontally to rotate the product"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {sequence && mode === 'sequence' && frameCount > 0 && currentImage && (
              <>
                <img
                  key={currentImage.path}
                  src={currentImage.path}
                  alt={`${productName} in ${variantName}, angle ${frame + 1} of ${frameCount}`}
                  style={{ transform: `scale(${zoom})` }}
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                />
                <div className="viewer-badge">{sequence.source === 'seed_derived' ? 'Editorial 360° sequence' : `${sequence.frameCount}-angle 360° sequence`}</div>
                <div className="viewer-frame-count">ANGLE {frame + 1} / {frameCount} · {Math.round(zoom * 100)}%</div>
              </>
            )}

            {sequence && mode === 'model' && hasModel && (
              <Suspense fallback={<div className="viewer-loading">Preparing optional 3D model…</div>}>
                <Model3DViewer modelPath={sequence.modelPath!} command={command} onError={setModelError} />
              </Suspense>
            )}

            {(!sequence || frameCount === 0) && (
              <div className="viewer-empty">
                <div>
                  <Images size={28} className="gold-text" />
                  <h3>360° angles are being prepared</h3>
                  <p>This colour has normal product photography, but no complete multi-angle sequence yet.</p>
                  <p className="viewer-note">The admin 360° PRODUCT IMAGES section accepts 8, 12, 16, 24 or 36 photographs per colour. A single static image is never presented as 3D.</p>
                </div>
              </div>
            )}
          </div>

          <aside className="viewer-side">
            <div className="viewer-modes">
              <button className={`viewer-mode ${mode === 'sequence' ? 'active' : ''}`} type="button" onClick={() => setMode('sequence')} aria-pressed={mode === 'sequence'}>
                <Images size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} /> Images
              </button>
              <button
                className={`viewer-mode ${mode === 'model' ? 'active' : ''}`}
                type="button"
                disabled={!hasModel}
                onClick={() => { setMode('model'); setModelError(''); }}
                aria-pressed={mode === 'model'}
              >
                <Box size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} /> 3D model
              </button>
            </div>
            <div className="viewer-hint">
              {mode === 'sequence'
                ? 'Drag left or right with a mouse or finger. Use pinch, scroll, +/− or the buttons to zoom. Arrow keys rotate; R or 0 resets; F toggles fullscreen.'
                : 'Drag to orbit the optional GLB/glTF model. Pinch or scroll to zoom. The image sequence remains available without a 3D model.'}
            </div>
            {modelError && <div className="viewer-hint gold-text">{modelError}</div>}
            {sequence && mode === 'sequence' && frameCount > 0 && (
              <div className="viewer-filmstrip" aria-label="360 degree angle thumbnails">
                {sequence.images.map((image, index) => (
                  <button
                    className={`viewer-thumb ${index === frame ? 'active' : ''}`}
                    type="button"
                    key={image.id ?? `${image.path}-${index}`}
                    onClick={() => { frameRef.current = index; setFrame(index); }}
                    aria-label={`Show angle ${index + 1}`}
                    aria-pressed={index === frame}
                  >
                    <img src={image.thumbPath} alt="" loading="lazy" decoding="async" />
                    <span>{index + 1}</span>
                  </button>
                ))}
              </div>
            )}
            {sequence?.source === 'seed_derived' && (
              <div className="viewer-note">These are catalogue-derived transition angles. An admin can replace them with true front, side and rear photographs for this exact colour.</div>
            )}
          </aside>
        </div>

        <div className="viewer-controls">
          <button className="icon-btn" type="button" onClick={() => sendCommand('rotateLeft')} disabled={!sequence || frameCount === 0} aria-label="Rotate left"><ChevronLeft size={17} /></button>
          <button className="icon-btn" type="button" onClick={() => sendCommand('rotateRight')} disabled={!sequence || frameCount === 0} aria-label="Rotate right"><ChevronRight size={17} /></button>
          <button className="icon-btn" type="button" onClick={() => sendCommand('zoomOut')} disabled={!sequence || frameCount === 0} aria-label="Zoom out"><ZoomOut size={16} /></button>
          <span className="viewer-zoom-label">{mode === 'sequence' ? `${Math.round(zoom * 100)}%` : '3D'}</span>
          <button className="icon-btn" type="button" onClick={() => sendCommand('zoomIn')} disabled={!sequence || frameCount === 0} aria-label="Zoom in"><ZoomIn size={16} /></button>
          <button className="btn btn-outline btn-small" type="button" onClick={() => sendCommand('reset')} disabled={!sequence || frameCount === 0}><RotateCcw size={14} /> Reset</button>
          <button className="btn btn-outline btn-small" type="button" onClick={() => void toggleFullscreen()} aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />} {isFullscreen ? 'Exit' : 'Fullscreen'}
          </button>
        </div>
        {fullscreenError && <div className="notice" style={{ margin: '0 20px 14px' }}>{fullscreenError}</div>}
      </div>
    </div>,
    document.body,
  );
}
