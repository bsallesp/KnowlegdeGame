"use client";

import { motion, AnimatePresence } from "framer-motion";

export interface AudiobookEntry {
  id: string;
  scopeId: string;
  scopeType: "item" | "subitem";
  scopeLabel: string;
  url: string;
  createdAt: Date;
}

interface AudiobookDialogProps {
  open: boolean;
  onClose: () => void;
  scopeLabel: string;
  audios: AudiobookEntry[];
  isGenerating: boolean;
  onGenerate: () => void;
  onPlay: (entry: AudiobookEntry) => void;
}

function fmt(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function AudiobookDialog({
  open,
  onClose,
  scopeLabel,
  audios,
  isGenerating,
  onGenerate,
  onPlay,
}: AudiobookDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            style={{ backgroundColor: "rgba(9,9,14,0.7)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.93, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: 10 }}
            transition={{ type: "spring", damping: 22, stiffness: 300 }}
            className="fixed z-50 left-80 top-1/2 -translate-y-1/2 w-80 rounded-2xl flex flex-col overflow-hidden"
            style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #2E2E40" }}>
              <div className="flex items-center gap-2 min-w-0">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "#818CF8" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 18v-6a9 9 0 0118 0v6" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z" />
                </svg>
                <span className="text-sm font-semibold truncate" style={{ color: "#EEEEFF" }}>
                  {scopeLabel}
                </span>
              </div>
              <button onClick={onClose} className="p-1 rounded flex-shrink-0" style={{ color: "#9494B8" }} aria-label="Fechar">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Audio list */}
            <div className="flex flex-col gap-1 p-3 max-h-64 overflow-y-auto">
              {audios.length === 0 ? (
                <p className="text-xs text-center py-6" style={{ color: "#9494B8" }}>
                  Nenhum áudio gerado ainda.
                </p>
              ) : (
                audios.map((entry, i) => (
                  <motion.button
                    key={entry.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => { onPlay(entry); onClose(); }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left w-full transition-colors"
                    style={{ backgroundColor: "rgba(129,140,248,0.06)", border: "1px solid #2E2E40" }}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: "rgba(129,140,248,0.15)" }}
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" style={{ color: "#818CF8" }}>
                        <path d="M8 5v14l11-7L8 5z" />
                      </svg>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium" style={{ color: "#EEEEFF" }}>
                        Áudio #{audios.length - i}
                      </span>
                      <span className="text-xs" style={{ color: "#9494B8" }}>
                        {fmt(entry.createdAt)}
                      </span>
                    </div>
                  </motion.button>
                ))
              )}
            </div>

            {/* Generate button */}
            <div className="p-3" style={{ borderTop: "1px solid #2E2E40" }}>
              <motion.button
                whileHover={{ scale: isGenerating ? 1 : 1.02 }}
                whileTap={{ scale: isGenerating ? 1 : 0.98 }}
                onClick={() => { if (!isGenerating) { onGenerate(); onClose(); } }}
                disabled={isGenerating}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold"
                style={{
                  backgroundColor: isGenerating ? "#1C1C28" : "#818CF8",
                  color: isGenerating ? "#9494B8" : "white",
                  cursor: isGenerating ? "not-allowed" : "pointer",
                }}
              >
                {isGenerating ? (
                  <>
                    <motion.span animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }} className="inline-block">
                      🎧
                    </motion.span>
                    Gerando...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Criar novo áudio
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
