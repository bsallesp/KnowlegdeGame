"use client";

import { useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import Link from "next/link";

/* ── Neural graph background ─────────────────────────────────── */

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  pulsePhase: number;
}

const COLORS = ["#818CF8", "#38BDF8", "#60A5FA", "#A78BFA", "#6366F1"];
const NODE_COUNT = 70;
const CONNECTION_DIST = 140;

function useNeuralCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const nodesRef = useRef<Node[]>([]);
  const frameRef = useRef(0);
  const mouseRef = useRef({ x: -1000, y: -1000 });

  const init = useCallback((w: number, h: number) => {
    nodesRef.current = Array.from({ length: NODE_COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      radius: Math.random() * 2.5 + 1,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      pulsePhase: Math.random() * Math.PI * 2,
    }));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
      if (nodesRef.current.length === 0) init(window.innerWidth, window.innerHeight);
    };
    resize();
    window.addEventListener("resize", resize);

    const onMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMouse);

    let time = 0;

    const draw = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      time += 0.01;

      const nodes = nodesRef.current;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      // update positions
      for (const n of nodes) {
        // gentle mouse repulsion
        const dmx = n.x - mx;
        const dmy = n.y - my;
        const dmDist = Math.sqrt(dmx * dmx + dmy * dmy);
        if (dmDist < 180 && dmDist > 0) {
          const force = (1 - dmDist / 180) * 0.3;
          n.vx += (dmx / dmDist) * force;
          n.vy += (dmy / dmDist) * force;
        }

        // damping
        n.vx *= 0.995;
        n.vy *= 0.995;

        n.x += n.vx;
        n.y += n.vy;

        // wrap edges softly
        if (n.x < -20) n.x = w + 20;
        if (n.x > w + 20) n.x = -20;
        if (n.y < -20) n.y = h + 20;
        if (n.y > h + 20) n.y = -20;
      }

      // draw connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECTION_DIST) {
            const alpha = (1 - dist / CONNECTION_DIST) * 0.25;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(129, 140, 248, ${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      // draw nodes with pulse
      for (const n of nodes) {
        const pulse = Math.sin(time * 2 + n.pulsePhase) * 0.3 + 0.7;
        const r = n.radius * pulse;

        // glow
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 3, 0, Math.PI * 2);
        ctx.fillStyle = n.color + "0A";
        ctx.fill();

        // core
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = n.color + "CC";
        ctx.fill();
      }

      frameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouse);
    };
  }, [canvasRef, init]);
}

/* ── Suggestions ─────────────────────────────────────────────── */

const SUGGESTIONS = [
  "What can Dystoppia do?",
  "Build me an app that...",
  "Help me learn AWS",
  "Analyze a business idea",
];

/* ── Landing Page ────────────────────────────────────────────── */

export default function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useNeuralCanvas(canvasRef);

  return (
    <div
      className="relative min-h-screen flex flex-col overflow-hidden"
      style={{ backgroundColor: "#09090E" }}
    >
      {/* Animated neural graph background */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ opacity: 0.45 }}
      />

      {/* Radial glow from top */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 40% at 50% 0%, rgba(99, 102, 241, 0.12) 0%, transparent 70%)",
        }}
      />

      {/* Bottom fade */}
      <div
        className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none"
        style={{
          background:
            "linear-gradient(to top, #09090E 0%, transparent 100%)",
        }}
      />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto w-full">
        <span
          className="font-bold text-lg tracking-tight"
          style={{ color: "#EEEEFF" }}
        >
          Dystoppia
        </span>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm px-4 py-2 rounded-lg transition-colors"
            style={{ color: "#9494B8" }}
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="text-sm font-semibold px-5 py-2 rounded-xl transition-all"
            style={{
              backgroundColor: "rgba(129, 140, 248, 0.15)",
              border: "1px solid rgba(129, 140, 248, 0.3)",
              color: "#818CF8",
            }}
          >
            Sign up
          </Link>
        </div>
      </nav>

      {/* Main content — centered */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="w-full max-w-2xl flex flex-col items-center"
        >
          {/* Brand */}
          <h1
            className="text-5xl md:text-6xl font-bold tracking-tight mb-3"
            style={{
              background: "linear-gradient(135deg, #818CF8 0%, #38BDF8 50%, #818CF8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundSize: "200% 200%",
              animation: "gradientShift 6s ease infinite",
            }}
          >
            Dystoppia
          </h1>

          <p
            className="text-base md:text-lg mb-10 text-center"
            style={{ color: "#9494B8" }}
          >
            What can I help you with?
          </p>

          {/* Chat-style input */}
          <div
            className="w-full rounded-2xl overflow-hidden transition-shadow"
            style={{
              backgroundColor: "#12121A",
              border: "1px solid #2E2E40",
              boxShadow:
                "0 0 0 1px rgba(129, 140, 248, 0.05), 0 8px 40px rgba(0, 0, 0, 0.5)",
            }}
          >
            <textarea
              rows={3}
              placeholder="Message Dystoppia..."
              className="w-full resize-none bg-transparent px-5 py-4 text-base outline-none placeholder-opacity-50"
              style={{ color: "#EEEEFF" }}
              onFocus={(e) => {
                const parent = e.currentTarget.parentElement;
                if (parent) parent.style.borderColor = "rgba(129, 140, 248, 0.4)";
              }}
              onBlur={(e) => {
                const parent = e.currentTarget.parentElement;
                if (parent) parent.style.borderColor = "#2E2E40";
              }}
            />

            <div
              className="flex items-center justify-between px-5 py-3"
              style={{ borderTop: "1px solid #1C1C28" }}
            >
              <span className="text-xs" style={{ color: "#6B6B8A" }}>
                Sign up to start
              </span>
              <Link
                href="/register"
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all"
                style={{ backgroundColor: "#818CF8", color: "#09090E" }}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
                Start
              </Link>
            </div>
          </div>

          {/* Suggestion chips */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-5 flex flex-wrap gap-2 justify-center"
          >
            {SUGGESTIONS.map((s) => (
              <Link
                href="/register"
                key={s}
                className="px-4 py-2 rounded-full text-xs font-medium transition-all hover:border-opacity-60"
                style={{
                  backgroundColor: "rgba(28, 28, 40, 0.6)",
                  border: "1px solid #2E2E40",
                  color: "#9494B8",
                  backdropFilter: "blur(8px)",
                }}
              >
                {s}
              </Link>
            ))}
          </motion.div>
        </motion.div>
      </main>

      {/* Minimal footer */}
      <footer
        className="relative z-10 py-4 px-6 text-center text-xs"
        style={{ color: "#6B6B8A" }}
      >
        © {new Date().getFullYear()} Dystoppia
      </footer>

      {/* Gradient shift keyframes */}
      <style jsx global>{`
        @keyframes gradientShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
      `}</style>
    </div>
  );
}
