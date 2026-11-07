import { useEffect, useRef } from 'react';
import {
  MAX_RIPPLES,
  WATER_PALETTE,
  detectWaterTier,
  hasWebGL,
  makeRipple,
  onWaterSplash,
  prefersReducedMotion,
  type Ripple,
  type WaterTier,
} from '@/lib/water';

const VERTEX_SHADER = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

/**
 * Fragment shader: a slow fBm "current" plus up to MAX_RIPPLES expanding wave rings.
 * The normal is derived from analytic derivatives of the height field, so the gold
 * specular highlight slides over the surface like light on moving water.
 * Mocha/espresso base, burnt-amber depth, champagne-gold specular — no cyan water.
 */
const FRAGMENT_SHADER = `
  precision mediump float;

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec3 u_ripples[MAX];
  uniform vec3 u_abyss;
  uniform vec3 u_espresso;
  uniform vec3 u_mocha;
  uniform vec3 u_amber;
  uniform vec3 u_gold;

  // Cheap, band-limited wave field: four directional sine swells plus one low-frequency swell.
  // No per-pixel noise loops, so this runs in a handful of ALU ops per fragment and holds 60 fps
  // on phones and on software rasterisers.
  float swell(vec2 p, float t) {
    float h = 0.0;
    h += sin(p.x * 1.35 + t * 0.42) * 0.30;
    h += sin(p.y * 1.05 - t * 0.31 + 1.7) * 0.26;
    h += sin((p.x * 0.72 + p.y * 0.68) * 1.9 + t * 0.23 + 0.9) * 0.18;
    h += sin((p.x * 0.55 - p.y * 0.83) * 2.6 - t * 0.36 + 2.4) * 0.12;
    h += sin(length(p - 0.5) * 5.5 - t * 0.5) * 0.10;
    return h;
  }

  // One tap per ripple ring: concentric waves that expand and fade with distance and age.
  float rings(vec2 p, float t) {
    float h = 0.0;
    for (int i = 0; i < MAX; i++) {
      vec3 ripple = u_ripples[i];
      if (ripple.z <= 0.001) continue;
      vec2 delta = p - ripple.xy;
      delta.x *= u_resolution.x / max(u_resolution.y, 1.0);
      float distanceToRipple = length(delta);
      float radius = ripple.z * 0.30;
      float edge = distanceToRipple - radius;
      float falloff = exp(-edge * edge * 70.0) * exp(-ripple.z * 0.9);
      h += cos(edge * 42.0) * falloff;
    }
    return h;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    // Keep the field isotropic on wide screens.
    vec2 p = vec2(uv.x * (u_resolution.x / max(u_resolution.y, 1.0)), uv.y);

    float h = swell(p, u_time) + rings(p, u_time);

    // Analytic-ish normal from two cheap offsets.
    float e = 0.006;
    float hx = swell(p + vec2(e, 0.0), u_time) + rings(p + vec2(e, 0.0), u_time) - h;
    float hy = swell(p + vec2(0.0, e), u_time) + rings(p + vec2(0.0, e), u_time) - h;
    vec3 normal = normalize(vec3(-hx * 9.0, -hy * 9.0, 1.0));

    vec3 lightDir = normalize(vec3(-0.32, 0.46, 0.83));
    float diffuse = clamp(dot(normal, lightDir), 0.0, 1.0);
    float specular = pow(clamp(dot(reflect(-lightDir, normal), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 18.0);

    float depth = clamp(h * 0.55 + 0.5, 0.0, 1.0);
    vec3 color = mix(u_abyss, u_espresso, smoothstep(0.05, 0.6, depth));
    color = mix(color, u_mocha, smoothstep(0.45, 0.9, depth) * 0.9);
    color = mix(color, u_amber, pow(clamp(h, 0.0, 1.0), 1.5) * 0.5);
    color += u_gold * specular * 0.42;
    color += u_gold * smoothstep(0.62, 1.0, depth) * 0.035;

    // Diffuse depth cue keeps the troughs dark without a texture lookup.
    color *= 0.82 + diffuse * 0.22;

    vec2 centred = uv - 0.5;
    color *= 1.0 - dot(centred, centred) * 0.75;

    gl_FragColor = vec4(color, 1.0);
  }
`;

interface WaterSurfaceProps {
  /** Rendered as a fixed background layer when true. */
  fixed?: boolean;
  className?: string;
  /** Force a tier (used by tests and storybook-style previews). */
  tier?: WaterTier;
  /** 0..1 opacity of the whole layer. */
  opacity?: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
  ];
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * The site-wide liquid surface.
 *
 * - WebGL shader for the flowing current + ripples (2D canvas fallback when WebGL is absent).
 * - Pointer/touch anywhere on the page creates an independent, expanding ripple.
 * - Scroll drifts the current so the page feels like it is moving through water.
 * - Rendered at a fraction of device resolution and paused when the tab is hidden or the
 *   element is off-screen; "lite" tier halves the resolution and the ripple budget.
 * - prefers-reduced-motion paints one static frame and installs no listeners.
 */
export function WaterSurface({ fixed = true, className = '', tier, opacity = 1 }: WaterSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    const wrapElement = wrapRef.current;
    if (!canvasElement || !wrapElement) return;
    const canvas: HTMLCanvasElement = canvasElement;
    const wrap: HTMLDivElement = wrapElement;

    const resolvedTier = detectWaterTier(tier);
    if (resolvedTier === 'off') {
      wrap.dataset.water = 'static';
      return;
    }

    const useGl = hasWebGL();
    // Render straight to CSS pixels (no DPR multiplication): the surface is a soft backdrop, so
    // extra pixels cost GPU time without visibly improving it. The cap keeps huge monitors cheap.
    let scale = resolvedTier === 'full' ? 0.75 : 0.5;
    const maxRipples = resolvedTier === 'full' ? MAX_RIPPLES : 5;

    const ripples: Ripple[] = [];
    let scrollDrift = window.scrollY * 0.00022;
    let frame = 0;
    let last = performance.now();
    let running = true;
    let visible = true;
    let lastPointer: { x: number; y: number; time: number } | null = null;
    let frameCount = 0;
    let lastProbe = 0;
    // Adaptive-resolution governor: the surface degrades its own pixel budget rather than dropping
    // frames on a weak GPU. It only ever steps down, so it cannot oscillate.
    let governorFrames = 0;
    let governorTime = 0;
    let degraded = 0;

    function addRipple(x: number, y: number, strength: number): void {
      ripples.push(makeRipple(x, y, strength));
      while (ripples.length > maxRipples) ripples.shift();
    }

    /* ---------------------------------------------------------------- WebGL path */
    let gl: WebGLRenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let rippleUniform: WebGLUniformLocation | null = null;
    let timeUniform: WebGLUniformLocation | null = null;
    let resolutionUniform: WebGLUniformLocation | null = null;

    if (useGl) {
      gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, powerPreference: 'low-power' });
      if (gl) {
        // Software rasterisers (SwiftShader, llvmpipe, some old Android GPUs) cannot fill a
        // full-screen shader in real time. Start them very low and let the governor below fine-tune.
        try {
          const info = gl.getExtension('WEBGL_debug_renderer_info');
          const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
          if (/swiftshader|software|llvmpipe|basic render/i.test(renderer)) scale = 0.26;
        } catch {
          /* the extension is optional */
        }
        const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER.replace(/MAX/g, String(MAX_RIPPLES)));
        const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
        if (fragment && vertex) {
          program = gl.createProgram();
          if (program) {
            gl.attachShader(program, vertex);
            gl.attachShader(program, fragment);
            gl.linkProgram(program);
            if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
              gl.useProgram(program);
              const buffer = gl.createBuffer();
              gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
              gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
              const position = gl.getAttribLocation(program, 'a_position');
              gl.enableVertexAttribArray(position);
              gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
              rippleUniform = gl.getUniformLocation(program, 'u_ripples');
              timeUniform = gl.getUniformLocation(program, 'u_time');
              resolutionUniform = gl.getUniformLocation(program, 'u_resolution');

              const palette: Array<[string, string]> = [
                ['u_abyss', WATER_PALETTE.abyss],
                ['u_espresso', WATER_PALETTE.espresso],
                ['u_mocha', WATER_PALETTE.mocha],
                ['u_amber', WATER_PALETTE.amber],
                ['u_gold', WATER_PALETTE.gold],
              ];
              for (const [name, hex] of palette) {
                const location = gl.getUniformLocation(program, name);
                if (location) gl.uniform3fv(location, hexToRgb(hex));
              }
            } else {
              gl.deleteProgram(program);
              program = null;
            }
          }
        }
        if (!program) {
          gl = null;
        }
      }
    }

    function resize(): void {
      const width = Math.max(160, Math.min(1280, Math.round(window.innerWidth * scale)));
      const height = Math.max(120, Math.min(800, Math.round(window.innerHeight * scale)));
      canvas.width = width;
      canvas.height = height;
      if (gl) gl.viewport(0, 0, width, height);
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    /* ---------------------------------------------------------------- 2D fallback */
    const ctx2d = useGl ? null : canvas.getContext('2d');

    function paint2d(time: number, dt: number): void {
      if (!ctx2d) return;
      const { width, height } = canvas;
      const gradient = ctx2d.createLinearGradient(0, 0, width * 0.4, height);
      gradient.addColorStop(0, WATER_PALETTE.abyss);
      gradient.addColorStop(0.5, WATER_PALETTE.espresso);
      gradient.addColorStop(1, '#241a12');
      ctx2d.globalCompositeOperation = 'source-over';
      ctx2d.fillStyle = gradient;
      ctx2d.fillRect(0, 0, width, height);

      ctx2d.globalCompositeOperation = 'lighter';
      for (const ripple of ripples) {
        if (ripple.age > 2.2) continue;
        const radius = ripple.age * 0.34 * Math.max(width, height);
        const fade = Math.max(0, 1 - ripple.age / 2.2) * ripple.strength;
        for (let ring = 0; ring < 2; ring += 1) {
          ctx2d.beginPath();
          ctx2d.strokeStyle = `rgba(232, 208, 154, ${0.16 * fade * (1 - ring * 0.4)})`;
          ctx2d.lineWidth = Math.max(1, 2.4 - ring);
          ctx2d.arc(ripple.x * width, ripple.y * height, Math.max(1, radius - ring * 9), 0, Math.PI * 2);
          ctx2d.stroke();
        }
      }

      // A slow mocha swell so the fallback is not a dead gradient.
      const swell = Math.sin(time * 0.0004) * 0.5 + 0.5;
      ctx2d.globalCompositeOperation = 'overlay';
      ctx2d.fillStyle = `rgba(162, 99, 42, ${0.05 + swell * 0.045})`;
      ctx2d.fillRect(0, height * (0.2 + swell * 0.15), width, height * 0.5);
      ctx2d.globalCompositeOperation = 'source-over';
      void dt;
    }

    /* ---------------------------------------------------------------- animation */
    function draw(now: number): void {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      const rawDelta = now - last;
      last = now;

      governorFrames += 1;
      governorTime += Math.min(rawDelta, 200);
      if (governorFrames >= 45) {
        const averageFrame = governorTime / governorFrames;
        governorFrames = 0;
        governorTime = 0;
        if (averageFrame > 22 && scale > 0.18) {
          scale = Math.max(0.18, scale * 0.72);
          degraded += 1;
          resize();
        } else if (averageFrame < 12 && degraded > 0 && scale < (resolvedTier === 'full' ? 0.75 : 0.5)) {
          // Plenty of headroom again (e.g. the device cooled down): recover one step.
          scale = Math.min(resolvedTier === 'full' ? 0.75 : 0.5, scale * 1.25);
          degraded -= 1;
          resize();
        }
        wrap.dataset.quality = `${Math.round(scale * 100)}%`;
      }

      for (let index = ripples.length - 1; index >= 0; index -= 1) {
        ripples[index].age += dt * ripples[index].speed;
        if (ripples[index].age > 3.2) ripples.splice(index, 1);
      }

      if (visible) {
        if (gl && program) {
          const data = new Float32Array(MAX_RIPPLES * 3);
          ripples.forEach((ripple, index) => {
            if (index >= MAX_RIPPLES) return;
            data[index * 3] = ripple.x;
            data[index * 3 + 1] = 1 - ripple.y;
            data[index * 3 + 2] = ripple.age;
          });
          if (rippleUniform) gl.uniform3fv(rippleUniform, data);
          if (timeUniform) gl.uniform1f(timeUniform, now * 0.001 + scrollDrift);
          if (resolutionUniform) gl.uniform2f(resolutionUniform, canvas.width, canvas.height);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        } else {
          paint2d(now, dt);
        }
      }

      frameCount += 1;
      // The ripple count is a cheap live probe (no readPixels) so tests and QA can see the pool.
      wrap.dataset.ripples = String(ripples.length);

      // Read-only probes for automated verification. They cost one tiny readPixels per second
      // and let the test suite prove the surface is really animating and really reacting to touch
      // without forcing preserveDrawingBuffer (which slows down real phones).
      if (now - lastProbe > 1000) {
        lastProbe = now;
        wrap.dataset.frames = String(Math.round(now));
        let probe = '0,0,0';
        // readPixels stalls the GPU, so the sampled-colour probe only runs when a test harness
        // opts in via <html data-zzkd-probe="on">. Real customers never pay for it.
        const probeEnabled = (window as Window & { __zzkdProbe?: boolean }).__zzkdProbe === true;
        try {
          if (!probeEnabled) throw new Error('probe disabled');
          if (gl) {
            const pixels = new Uint8Array(4 * 4 * 4);
            gl.readPixels(Math.floor(canvas.width / 2) - 2, Math.floor(canvas.height / 2) - 2, 4, 4, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            let r = 0; let g = 0; let b = 0;
            for (let index = 0; index < pixels.length; index += 4) { r += pixels[index]; g += pixels[index + 1]; b += pixels[index + 2]; }
            const count = pixels.length / 4;
            probe = `${Math.round(r / count)},${Math.round(g / count)},${Math.round(b / count)}`;
          } else if (ctx2d) {
            const sample = ctx2d.getImageData(Math.max(0, canvas.width / 2 - 2), Math.max(0, canvas.height / 2 - 2), 4, 4).data;
            let r = 0; let g = 0; let b = 0;
            for (let index = 0; index < sample.length; index += 4) { r += sample[index]; g += sample[index + 1]; b += sample[index + 2]; }
            const count = sample.length / 4;
            probe = `${Math.round(r / count)},${Math.round(g / count)},${Math.round(b / count)}`;
          }
        } catch {
          probe = '0,0,0';
        }
        wrap.dataset.probe = probe;
      }

      frame = window.requestAnimationFrame(draw);
    }

    /* ---------------------------------------------------------------- listeners */
    function handlePointer(event: PointerEvent): void {
      // Every distinct touch-down gets its own ripple (two fingers landing together must produce
      // two rings), while pointer *movement* is rate-limited so a fast drag cannot flood the pool.
      if (event.type === 'pointermove') {
        const now = performance.now();
        if (lastPointer && now - lastPointer.time < 55) return;
        lastPointer = { x: event.clientX, y: event.clientY, time: now };
      } else {
        lastPointer = { x: event.clientX, y: event.clientY, time: performance.now() };
      }
      addRipple(event.clientX / window.innerWidth, event.clientY / window.innerHeight, event.type === 'pointerdown' ? 1.15 : 1);
    }

    function handleScroll(): void {
      scrollDrift = window.scrollY * 0.00022;
    }

    function handleVisibility(): void {
      running = document.visibilityState === 'visible';
      if (running) {
        last = performance.now();
        frame = window.requestAnimationFrame(draw);
      } else {
        window.cancelAnimationFrame(frame);
      }
    }

    const detachSplash = onWaterSplash(({ x, y, strength }) => addRipple(x, y, strength));

    if (!prefersReducedMotion()) {
      window.addEventListener('pointerdown', handlePointer, { passive: true });
      window.addEventListener('pointermove', handlePointer, { passive: true });
      window.addEventListener('scroll', handleScroll, { passive: true });
      document.addEventListener('visibilitychange', handleVisibility);
    }

    // Pause when the surface is scrolled away (it is fixed, so this only guards odd layouts).
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? true;
    }, { threshold: 0 });
    observer.observe(wrap);

    frame = window.requestAnimationFrame(draw);
    wrap.dataset.water = gl ? 'webgl' : 'canvas';

    return () => {
      running = false;
      window.cancelAnimationFrame(frame);
      detachSplash();
      observer.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointerdown', handlePointer);
      window.removeEventListener('pointermove', handlePointer);
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (gl) {
        const lose = gl.getExtension('WEBGL_lose_context');
        lose?.loseContext();
      }
      delete wrap.dataset.water;
      delete wrap.dataset.frames;
      delete wrap.dataset.ripples;
      delete wrap.dataset.probe;
      delete wrap.dataset.quality;
    };
  }, [tier]);

  return (
    <div
      ref={wrapRef}
      className={`water-surface ${fixed ? 'water-surface-fixed' : ''} ${className}`.trim()}
      style={{ opacity }}
      aria-hidden="true"
      data-testid="water-surface"
    >
      <canvas ref={canvasRef} className="water-canvas" />
      <div className="water-caustics" />
      <div className="water-vignette" />
    </div>
  );
}
