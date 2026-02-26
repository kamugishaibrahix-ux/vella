"use client";

import { useEffect, useRef } from "react";
import type { VoiceState } from "./VoiceChamber";

// --- Types ---

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseSpeed: number;
  radius: number;
  baseOpacity: number;
  hue: number;
  lightness: number;
}

interface VoiceParticleFieldProps {
  state: VoiceState;
  amplitude?: number;
}

// --- Constants ---

const PARTICLE_COUNT = 190;
const BASE_SPEED = 0.12;
const TOUCH_RADIUS = 80;
const TOUCH_STRENGTH = 0.3;
const LERP_SPEED = 0.025;

// Neural lines — extremely subtle
const CONNECTION_DIST = 70;
const MAX_CONNECTIONS = 2;
const LINE_WIDTH = 0.3;
const LINE_OPACITY_MAX = 0.05;
const LINE_OPACITY_MIN = 0.02;

// Background
const BG_COLOR = "#081C15";
const BG_RADIAL_COLOR = "rgba(16, 52, 38, 0.5)";

// Cognitive well (hex grid)
const HEX_RADIUS = 18;
const HEX_GRID_EXTENT = 7;

// Spatial grid cell
const GRID_CELL = CONNECTION_DIST;

// --- Helpers ---

function noise(x: number, y: number, t: number): number {
  return (
    Math.sin(x * 0.01 + t * 0.3) * 0.5 +
    Math.cos(y * 0.013 + t * 0.2) * 0.5
  );
}

// Pre-compute hex offsets for a flat-top hexagon
const HEX_ANGLES: number[] = [];
for (let i = 0; i < 6; i++) HEX_ANGLES.push((Math.PI / 3) * i);

function drawHexCell(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  alpha: number,
) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = HEX_ANGLES[i];
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = `hsla(152, 30%, 50%, ${alpha})`;
  ctx.stroke();
}

// --- Component ---

export function VoiceParticleField({ state, amplitude = 0 }: VoiceParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const touchRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });
  const stateRef = useRef<VoiceState>(state);
  const amplitudeRef = useRef<number>(amplitude);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  // Smooth interpolation targets (all via refs — no React re-renders)
  const curSpeedRef = useRef(1);
  const curOpacityRef = useRef(1);
  const curInwardRef = useRef(0);
  const curOrbitalRef = useRef(0);
  const curOutwardRef = useRef(0);
  const curWellOpacityRef = useRef(0.04);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { amplitudeRef.current = amplitude; }, [amplitude]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // --- Resize ---
    function resize() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w, h };
    }
    resize();
    window.addEventListener("resize", resize);

    // --- Init particles ---
    const w = sizeRef.current.w;
    const h = sizeRef.current.h;
    const particles: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * BASE_SPEED,
        vy: (Math.random() - 0.5) * BASE_SPEED,
        baseSpeed: BASE_SPEED * (0.4 + Math.random() * 1.0),
        radius: 0.8 + Math.random() * 1.2,
        baseOpacity: 0.12 + Math.random() * 0.25,
        hue: 140 + Math.random() * 25,
        lightness: 55 + Math.random() * 25,
      });
    }
    particlesRef.current = particles;

    // --- Touch ---
    function handlePointerMove(e: PointerEvent) {
      touchRef.current = { x: e.clientX, y: e.clientY, active: true };
    }
    function handlePointerLeave() {
      touchRef.current.active = false;
    }
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    canvas.addEventListener("pointerup", handlePointerLeave);

    // --- Spatial grid ---
    let gridCols = 0;
    let gridRows = 0;
    let grid: number[][] = [];

    function rebuildGrid(cw: number, ch: number, ps: Particle[]) {
      gridCols = Math.ceil(cw / GRID_CELL) + 1;
      gridRows = Math.ceil(ch / GRID_CELL) + 1;
      const total = gridCols * gridRows;
      if (grid.length < total) {
        grid = new Array(total);
        for (let i = 0; i < total; i++) grid[i] = [];
      } else {
        for (let i = 0; i < total; i++) {
          if (!grid[i]) grid[i] = [];
          else grid[i].length = 0;
        }
      }
      for (let i = 0; i < ps.length; i++) {
        const col = Math.floor(ps[i].x / GRID_CELL);
        const row = Math.floor(ps[i].y / GRID_CELL);
        if (col >= 0 && col < gridCols && row >= 0 && row < gridRows) {
          grid[row * gridCols + col].push(i);
        }
      }
    }

    // --- Pre-compute cognitive well hex centers ---
    const hexCenters: { qx: number; qy: number }[] = [];
    const hexW = HEX_RADIUS * 2;
    const hexH = HEX_RADIUS * Math.sqrt(3);
    for (let q = -HEX_GRID_EXTENT; q <= HEX_GRID_EXTENT; q++) {
      for (let r = -HEX_GRID_EXTENT; r <= HEX_GRID_EXTENT; r++) {
        // Axial to pixel (flat-top)
        const px = hexW * 0.75 * q;
        const py = hexH * (r + q * 0.5);
        // Only include hexes within a circular bound
        if (px * px + py * py < (HEX_GRID_EXTENT * hexW * 0.55) ** 2) {
          hexCenters.push({ qx: px, qy: py });
        }
      }
    }

    // --- Animation ---
    let lastTime = performance.now();

    function animate(now: number) {
      const dt = Math.min((now - lastTime) / 16.667, 3);
      lastTime = now;
      timeRef.current += dt * 0.016;

      const cw = sizeRef.current.w;
      const ch = sizeRef.current.h;
      const cx = cw / 2;
      const cy = ch / 2;
      const t = timeRef.current;
      const st = stateRef.current;
      const amp = amplitudeRef.current;

      // --- State-based targets ---
      let tSpeed = 1;
      let tOpacity = 1;
      let tInward = 0;
      let tOrbital = 0;
      let tOutward = 0;
      let tWellAlpha = 0.04;

      switch (st) {
        case "idle":
          tSpeed = 1;
          tOpacity = 1;
          tInward = 0;
          tOrbital = 0;
          tOutward = 0;
          tWellAlpha = 0.04;
          break;
        case "listening":
          tSpeed = 1.15 + amp * 0.4;
          tOpacity = 1 + amp * 0.3;
          tInward = 0.18 + amp * 0.15;
          tOrbital = 0;
          tOutward = 0;
          tWellAlpha = 0.04 + 0.05;
          break;
        case "processing":
          tSpeed = 0.7;
          tOpacity = 0.95;
          tInward = 0.06;
          tOrbital = 0.2;
          tOutward = 0;
          tWellAlpha = 0.04 + 0.08;
          break;
        case "responding":
          tSpeed = 1.05;
          tOpacity = 1.05;
          tInward = 0;
          tOrbital = 0;
          tOutward = 0.18 + Math.sin(t * 1.5) * 0.05;
          tWellAlpha = 0.04 + 0.06;
          break;
      }

      // Lerp all values
      const lr = LERP_SPEED * dt;
      curSpeedRef.current += (tSpeed - curSpeedRef.current) * lr;
      curOpacityRef.current += (tOpacity - curOpacityRef.current) * lr;
      curInwardRef.current += (tInward - curInwardRef.current) * lr;
      curOrbitalRef.current += (tOrbital - curOrbitalRef.current) * lr;
      curOutwardRef.current += (tOutward - curOutwardRef.current) * lr;
      curWellOpacityRef.current += (tWellAlpha - curWellOpacityRef.current) * lr;

      const speedMult = curSpeedRef.current;
      const opacityMult = curOpacityRef.current;
      const inward = curInwardRef.current;
      const orbital = curOrbitalRef.current;
      const outward = curOutwardRef.current;
      const wellAlpha = curWellOpacityRef.current;

      // --- Background ---
      ctx!.fillStyle = BG_COLOR;
      ctx!.fillRect(0, 0, cw, ch);

      // Subtle radial depth tint
      const grad = ctx!.createRadialGradient(cx, cy, 0, cx, cy, Math.max(cw, ch) * 0.45);
      grad.addColorStop(0, BG_RADIAL_COLOR);
      grad.addColorStop(1, "transparent");
      ctx!.fillStyle = grad;
      ctx!.fillRect(0, 0, cw, ch);

      // --- Cognitive well (hex grid) ---
      ctx!.lineWidth = 0.4;
      for (let i = 0; i < hexCenters.length; i++) {
        const hc = hexCenters[i];
        const hx = cx + hc.qx;
        const hy = cy + hc.qy;
        // Fade alpha by distance from center
        const hdist = Math.sqrt(hc.qx * hc.qx + hc.qy * hc.qy);
        const hmax = HEX_GRID_EXTENT * HEX_RADIUS * 1.2;
        const distFade = 1 - Math.min(hdist / hmax, 1);
        const a = wellAlpha * distFade * distFade;
        if (a < 0.005) continue;
        drawHexCell(ctx!, hx, hy, HEX_RADIUS, a);
      }

      // --- Update particles ---
      const touch = touchRef.current;
      const ps = particlesRef.current;

      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];

        // Base noise drift
        const n = noise(p.x, p.y, t);
        const angle = n * Math.PI * 2;
        p.vx += Math.cos(angle) * 0.007 * dt;
        p.vy += Math.sin(angle) * 0.007 * dt;

        const dx = p.x - cx;
        const dy = p.y - cy;
        const distFromCenter = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = dx / distFromCenter;
        const ny = dy / distFromCenter;

        // Inward attraction (listening)
        if (inward > 0.001) {
          p.vx -= nx * inward * 0.018 * dt;
          p.vy -= ny * inward * 0.018 * dt;
        }

        // Orbital bias (processing) — perpendicular to radial
        if (orbital > 0.001) {
          p.vx += -ny * orbital * 0.012 * dt;
          p.vy += nx * orbital * 0.012 * dt;
          // Slight cohesion to prevent escape
          p.vx -= nx * 0.004 * dt;
          p.vy -= ny * 0.004 * dt;
        }

        // Outward dispersion (responding)
        if (outward > 0.001) {
          p.vx += nx * outward * 0.014 * dt;
          p.vy += ny * outward * 0.014 * dt;
        }

        // Touch deflection
        if (touch.active) {
          const tdx = p.x - touch.x;
          const tdy = p.y - touch.y;
          const tdSq = tdx * tdx + tdy * tdy;
          if (tdSq < TOUCH_RADIUS * TOUCH_RADIUS && tdSq > 0) {
            const td = Math.sqrt(tdSq);
            const force = (1 - td / TOUCH_RADIUS) * TOUCH_STRENGTH;
            p.vx += (tdx / td) * force * dt;
            p.vy += (tdy / td) * force * dt;
          }
        }

        // Damping
        p.vx *= 0.98;
        p.vy *= 0.98;
        const maxV = p.baseSpeed * speedMult * 2;
        const v = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (v > maxV) {
          p.vx = (p.vx / v) * maxV;
          p.vy = (p.vy / v) * maxV;
        }

        // Move
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Wrap
        if (p.x < -10) p.x = cw + 10;
        if (p.x > cw + 10) p.x = -10;
        if (p.y < -10) p.y = ch + 10;
        if (p.y > ch + 10) p.y = -10;
      }

      // --- Spatial grid ---
      rebuildGrid(cw, ch, ps);

      // --- Neural connection lines ---
      ctx!.lineWidth = LINE_WIDTH;
      const connCounts = new Uint8Array(ps.length);
      const connDistSq = CONNECTION_DIST * CONNECTION_DIST;

      for (let i = 0; i < ps.length; i++) {
        if (connCounts[i] >= MAX_CONNECTIONS) continue;
        const p = ps[i];
        const col = Math.floor(p.x / GRID_CELL);
        const row = Math.floor(p.y / GRID_CELL);

        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = row + dr;
            const nc = col + dc;
            if (nr < 0 || nr >= gridRows || nc < 0 || nc >= gridCols) continue;
            const cell = grid[nr * gridCols + nc];
            for (let k = 0; k < cell.length; k++) {
              const j = cell[k];
              if (j <= i) continue;
              if (connCounts[i] >= MAX_CONNECTIONS) break;
              if (connCounts[j] >= MAX_CONNECTIONS) continue;

              const q = ps[j];
              const ldx = p.x - q.x;
              const ldy = p.y - q.y;
              const dSq = ldx * ldx + ldy * ldy;
              if (dSq > connDistSq) continue;

              const dist = Math.sqrt(dSq);
              const ratio = dist / CONNECTION_DIST;
              const lineAlpha = LINE_OPACITY_MIN + (LINE_OPACITY_MAX - LINE_OPACITY_MIN) * (1 - ratio) * (1 - ratio);

              ctx!.beginPath();
              ctx!.moveTo(p.x, p.y);
              ctx!.lineTo(q.x, q.y);
              ctx!.strokeStyle = `hsla(${(p.hue + q.hue) * 0.5}, 30%, ${(p.lightness + q.lightness) * 0.5}%, ${lineAlpha})`;
              ctx!.stroke();

              connCounts[i]++;
              connCounts[j]++;
            }
          }
        }
      }

      // --- Draw particles ---
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        const alpha = Math.min(p.baseOpacity * opacityMult, 0.5);
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx!.fillStyle = `hsla(${p.hue}, 40%, ${p.lightness}%, ${alpha})`;
        ctx!.fill();
      }

      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      canvas.removeEventListener("pointerup", handlePointerLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-auto"
      style={{ touchAction: "none" }}
    />
  );
}
