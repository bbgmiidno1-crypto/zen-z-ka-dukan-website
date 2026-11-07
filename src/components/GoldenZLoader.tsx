import { useEffect, useRef, useState } from 'react';
import { supportsThreeD } from '@/lib/motion';

const INTRO_DURATION = 2100;

function introAlreadySeen(): boolean {
  try {
    return sessionStorage.getItem('zzkd_intro_seen') === '1';
  } catch {
    return false;
  }
}

export function GoldenZLoader({ onComplete }: { onComplete: () => void }) {
  const [visible, setVisible] = useState(() => !introAlreadySeen());
  const [threeReady, setThreeReady] = useState(false);
  const [threeFailed, setThreeFailed] = useState(false);
  const [useThree] = useState(() => supportsThreeD());
  const canvasHost = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) {
      onComplete();
      return;
    }
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem('zzkd_intro_seen', '1');
      } catch {
        // Session storage can be unavailable in some embedded browsers.
      }
      setVisible(false);
      onComplete();
    }, INTRO_DURATION);
    return () => window.clearTimeout(timer);
  }, [visible, onComplete]);

  useEffect(() => {
    if (!visible || !useThree || !canvasHost.current) return;
    let disposed = false;
    let cleanup = () => {};
    const host = canvasHost.current;

    void (async () => {
      try {
        const THREE = await import('three');
        if (disposed) return;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
        camera.position.set(0, 0, 6.5);
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
        renderer.setClearColor(0x000000, 0);
        host.appendChild(renderer.domElement);
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';

        const shape = new THREE.Shape();
        shape.moveTo(-1.35, 1.25);
        shape.lineTo(1.35, 1.25);
        shape.lineTo(1.35, 0.82);
        shape.lineTo(-0.55, -0.82);
        shape.lineTo(1.35, -0.82);
        shape.lineTo(1.35, -1.25);
        shape.lineTo(-1.35, -1.25);
        shape.lineTo(-1.35, -0.82);
        shape.lineTo(0.55, 0.82);
        shape.lineTo(-1.35, 0.82);
        shape.closePath();
        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: 0.24,
          bevelEnabled: true,
          bevelThickness: 0.045,
          bevelSize: 0.038,
          bevelSegments: 2,
        });
        geometry.center();
        const material = new THREE.MeshStandardMaterial({
          color: 0xd4af37,
          metalness: 0.86,
          roughness: 0.28,
          emissive: 0x241702,
          emissiveIntensity: 0.14,
        });
        const monogram = new THREE.Mesh(geometry, material);
        monogram.scale.setScalar(0.92);
        scene.add(monogram);

        const ringGeometry = new THREE.TorusGeometry(1.75, 0.006, 6, 96);
        const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xd4af37, transparent: true, opacity: 0.22 });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = 1.15;
        scene.add(ring);

        const particleTotal = 14;
        const positions = new Float32Array(particleTotal * 3);
        for (let index = 0; index < particleTotal; index += 1) {
          positions[index * 3] = (Math.random() - 0.5) * 4.2;
          positions[index * 3 + 1] = (Math.random() - 0.5) * 4.2;
          positions[index * 3 + 2] = (Math.random() - 0.5) * 2.2;
        }
        const particlesGeometry = new THREE.BufferGeometry();
        particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const particlesMaterial = new THREE.PointsMaterial({ color: 0xe7ce82, size: 0.018, transparent: true, opacity: 0.32 });
        const particles = new THREE.Points(particlesGeometry, particlesMaterial);
        scene.add(particles);

        scene.add(new THREE.AmbientLight(0xffe6a6, 0.52));
        const key = new THREE.PointLight(0xffd77a, 7.5, 12);
        key.position.set(3, 3, 5);
        scene.add(key);
        const rim = new THREE.PointLight(0xa87918, 4.5, 12);
        rim.position.set(-4, -1, 3);
        scene.add(rim);

        const resize = () => {
          const size = host.getBoundingClientRect();
          const width = Math.max(1, Math.floor(size.width));
          const height = Math.max(1, Math.floor(size.height));
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        };
        resize();
        window.addEventListener('resize', resize);
        const clock = new THREE.Clock();
        let frame = 0;
        const animate = () => {
          if (disposed) return;
          const time = clock.getElapsedTime();
          monogram.rotation.y = Math.sin(time * 0.66) * 0.42;
          monogram.rotation.x = Math.sin(time * 0.45) * 0.09;
          monogram.position.y = Math.sin(time * 1.05) * 0.045;
          ring.rotation.z = time * 0.12;
          particles.rotation.y = time * 0.05;
          renderer.render(scene, camera);
          frame = requestAnimationFrame(animate);
        };
        animate();
        setThreeReady(true);
        cleanup = () => {
          cancelAnimationFrame(frame);
          window.removeEventListener('resize', resize);
          geometry.dispose();
          material.dispose();
          ringGeometry.dispose();
          ringMaterial.dispose();
          particlesGeometry.dispose();
          particlesMaterial.dispose();
          renderer.dispose();
          if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
        };
      } catch (error) {
        console.warn('3D loader fallback:', error);
        if (!disposed) setThreeFailed(true);
      }
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [visible, useThree]);

  if (!visible) return null;
  const showCssMonogram = !useThree || threeFailed || !threeReady;

  return (
    <div className="loading-screen" aria-label="ZEN Z KA DUKAN is loading">
      <div className="loader-content">
        <div ref={canvasHost} className="loader-three" aria-hidden="true">
          {showCssMonogram && (
            <div className="loader-monogram"><span>Z</span></div>
          )}
        </div>
        <div className="loader-title gold-shimmer">ZEN Z KA DUKAN</div>
        <div className="loader-caption">The art of dressing in gold</div>
        <div className="loader-progress" aria-hidden="true" />
      </div>
    </div>
  );
}
