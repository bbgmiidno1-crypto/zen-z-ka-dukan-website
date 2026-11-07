import { useEffect, useRef, useState } from 'react';
import type * as ThreeTypes from 'three';
import { prefersReducedMotion } from '@/lib/motion';
import { clamp, type ViewerCommand } from '@/lib/viewer';

interface Model3DViewerProps {
  modelPath: string;
  command: ViewerCommand | null;
  onError?: (message: string) => void;
}

interface ViewerApi {
  rotate: (delta: number) => void;
  zoom: (delta: number) => void;
  reset: () => void;
}

export default function Model3DViewer({ modelPath, command, onError }: Model3DViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ViewerApi | null>(null);
  const onErrorRef = useRef(onError);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('Loading optional 3D model…');

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let cleanup = () => {};
    setStatus('loading');
    setMessage('Loading optional 3D model…');

    void (async () => {
      try {
        const THREE = await import('three');
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        if (disposed) return;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
        camera.position.set(0, 0, 3.2);
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        renderer.domElement.style.touchAction = 'none';
        renderer.domElement.setAttribute('aria-label', 'Interactive GLB or glTF product model');
        host.appendChild(renderer.domElement);

        scene.add(new THREE.AmbientLight(0xfff0cf, 1.15));
        const key = new THREE.DirectionalLight(0xffe4a3, 3.2);
        key.position.set(3, 4, 5);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xc99a2e, 2.1);
        rim.position.set(-4, 1, -3);
        scene.add(rim);

        const gltf = await new GLTFLoader().loadAsync(modelPath);
        if (disposed) return;
        const pivot = new THREE.Group();
        pivot.add(gltf.scene);
        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const maxDimension = Math.max(0.001, size.x, size.y, size.z);
        gltf.scene.position.sub(center);
        pivot.scale.setScalar(2.25 / maxDimension);
        scene.add(pivot);

        const state = {
          rotationY: -0.28,
          rotationX: 0,
          distance: 3.2,
          dragging: false,
        };
        const pointers = new Map<number, { x: number; y: number }>();
        let lastPinchDistance = 0;

        const resize = () => {
          const rect = host.getBoundingClientRect();
          const width = Math.max(1, Math.floor(rect.width));
          const height = Math.max(1, Math.floor(rect.height));
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        };
        resize();
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);

        const canvas = renderer.domElement;
        const pointerDown = (event: PointerEvent) => {
          canvas.setPointerCapture(event.pointerId);
          pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
          state.dragging = true;
          if (pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            lastPinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
          }
        };
        const pointerMove = (event: PointerEvent) => {
          const previous = pointers.get(event.pointerId);
          if (!previous) return;
          pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (pointers.size === 1) {
            state.rotationY += (event.clientX - previous.x) * 0.008;
            state.rotationX = clamp(state.rotationX + (event.clientY - previous.y) * 0.004, -0.45, 0.45);
          } else if (pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            const distance = Math.hypot(a.x - b.x, a.y - b.y);
            if (lastPinchDistance > 0) {
              state.distance = clamp(state.distance - (distance - lastPinchDistance) * 0.006, 1.75, 6);
            }
            lastPinchDistance = distance;
          }
        };
        const pointerUp = (event: PointerEvent) => {
          pointers.delete(event.pointerId);
          if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
          if (pointers.size === 0) state.dragging = false;
          lastPinchDistance = 0;
        };
        const wheel = (event: WheelEvent) => {
          event.preventDefault();
          state.distance = clamp(state.distance + event.deltaY * 0.0025, 1.75, 6);
        };
        canvas.addEventListener('pointerdown', pointerDown);
        canvas.addEventListener('pointermove', pointerMove);
        canvas.addEventListener('pointerup', pointerUp);
        canvas.addEventListener('pointercancel', pointerUp);
        canvas.addEventListener('wheel', wheel, { passive: false });

        const api: ViewerApi = {
          rotate: (delta) => { state.rotationY += delta; },
          zoom: (delta) => { state.distance = clamp(state.distance + delta, 1.75, 6); },
          reset: () => {
            state.rotationY = -0.28;
            state.rotationX = 0;
            state.distance = 3.2;
          },
        };
        apiRef.current = api;

        const clock = new THREE.Clock();
        let frame = 0;
        const reduced = prefersReducedMotion();
        const animate = () => {
          if (disposed) return;
          const delta = Math.min(clock.getDelta(), 0.05);
          if (!reduced && !state.dragging) state.rotationY += delta * 0.12;
          pivot.rotation.y = state.rotationY;
          pivot.rotation.x = state.rotationX;
          camera.position.z += (state.distance - camera.position.z) * 0.16;
          renderer.render(scene, camera);
          frame = requestAnimationFrame(animate);
        };
        animate();
        setStatus('ready');

        cleanup = () => {
          cancelAnimationFrame(frame);
          resizeObserver.disconnect();
          canvas.removeEventListener('pointerdown', pointerDown);
          canvas.removeEventListener('pointermove', pointerMove);
          canvas.removeEventListener('pointerup', pointerUp);
          canvas.removeEventListener('pointercancel', pointerUp);
          canvas.removeEventListener('wheel', wheel);
          pivot.traverse((object) => {
            const mesh = object as ThreeTypes.Mesh;
            mesh.geometry?.dispose?.();
            const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
            materials.forEach((material) => {
              const candidate = material as ThreeTypes.MeshStandardMaterial;
              Object.values(candidate).forEach((value) => {
                if (value && typeof value === 'object' && 'isTexture' in value) {
                  (value as ThreeTypes.Texture).dispose();
                }
              });
              candidate.dispose?.();
            });
          });
          renderer.dispose();
          if (canvas.parentNode === host) host.removeChild(canvas);
          apiRef.current = null;
        };
      } catch (error) {
        console.warn('GLB/glTF viewer fallback:', error);
        if (!disposed) {
          const text = 'The 3D model could not be displayed. Use the image sequence instead.';
          setStatus('error');
          setMessage(text);
          onErrorRef.current?.(text);
        }
      }
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [modelPath]);

  useEffect(() => {
    if (!command || !apiRef.current) return;
    if (command.type === 'rotateLeft') apiRef.current.rotate(-0.32);
    if (command.type === 'rotateRight') apiRef.current.rotate(0.32);
    if (command.type === 'zoomIn') apiRef.current.zoom(-0.35);
    if (command.type === 'zoomOut') apiRef.current.zoom(0.35);
    if (command.type === 'reset') apiRef.current.reset();
  }, [command]);

  return (
    <div ref={hostRef} className="viewer-three" aria-label="Optional 3D product model">
      {status !== 'ready' && (
        <div className={`viewer-loading ${status === 'error' ? 'viewer-error' : ''}`} role="status">{message}</div>
      )}
    </div>
  );
}
