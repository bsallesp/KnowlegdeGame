"use client";

import { useState, useEffect, useId, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface InfoButtonProps {
  title: string;
  content: string;
  /** Which side the tooltip pops out — use "below" for buttons near the top of the screen */
  side?: "above" | "below";
}

export default function InfoButton({ title, content, side = "above" }: InfoButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const rawId = useId();
  const id = rawId.replace(/:/g, "");
  const gotItRef = useRef<HTMLButtonElement>(null);

  // Focus "Got it" button when dialog opens; close on ESC
  useEffect(() => {
    if (!showDialog) return;
    gotItRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowDialog(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showDialog]);

  const tooltipPos = side === "above" ? "bottom-full mb-2" : "top-full mt-2";

  return (
    <>
      <button
        type="button"
        aria-label={`Info: ${title}`}
        className="relative inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border font-bold leading-none flex-shrink-0 select-none transition-colors focus:outline-none"
        style={{
          borderColor: "#3E3E55",
          color: "#9494B8",
          backgroundColor: "transparent",
          fontSize: "9px",
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        onClick={() => {
          setShowTooltip(false);
          setShowDialog(true);
        }}
      >
        i

        {/* Tooltip — shown on hover / focus, hidden when dialog is open */}
        <AnimatePresence>
          {showTooltip && !showDialog && (
            <motion.div
              role="tooltip"
              initial={{ opacity: 0, y: side === "above" ? 4 : -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className={`absolute ${tooltipPos} left-1/2 -translate-x-1/2 w-56 text-left pointer-events-none z-[100]`}
            >
              <div
                className="px-3 py-2 rounded-lg text-xs leading-snug"
                style={{
                  backgroundColor: "#1C1C28",
                  border: "1px solid #2E2E40",
                  color: "#EEEEFF",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
                }}
              >
                <p className="font-semibold mb-0.5" style={{ color: "#818CF8" }}>{title}</p>
                <p style={{ color: "#9494B8" }}>{content}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      {/* Full dialog — for mouseless / keyboard users */}
      <AnimatePresence>
        {showDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(9,9,14,0.88)", backdropFilter: "blur(8px)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowDialog(false); }}
          >
            <motion.div
              initial={{ scale: 0.93, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.93, opacity: 0, y: 8 }}
              transition={{ type: "spring", damping: 26, stiffness: 340 }}
              className="w-full max-w-sm rounded-2xl p-6"
              style={{
                backgroundColor: "#12121A",
                border: "1px solid #2E2E40",
                boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
              }}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`ib-title-${id}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: "rgba(129,140,248,0.15)", color: "#818CF8" }}
                  >
                    i
                  </div>
                  <h3
                    id={`ib-title-${id}`}
                    className="font-bold text-sm"
                    style={{ color: "#EEEEFF" }}
                  >
                    {title}
                  </h3>
                </div>
                <button
                  onClick={() => setShowDialog(false)}
                  className="p-1 rounded-lg ml-2 flex-shrink-0"
                  style={{ color: "#9494B8" }}
                  aria-label="Close"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <p className="text-sm leading-relaxed" style={{ color: "#9494B8" }}>{content}</p>

              <button
                ref={gotItRef}
                onClick={() => setShowDialog(false)}
                className="mt-5 w-full py-2.5 rounded-xl text-sm font-semibold focus:outline-none"
                style={{
                  backgroundColor: "rgba(129,140,248,0.12)",
                  color: "#818CF8",
                  border: "1px solid rgba(129,140,248,0.2)",
                }}
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
