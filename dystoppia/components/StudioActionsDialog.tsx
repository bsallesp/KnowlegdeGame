"use client";

import { motion, AnimatePresence } from "framer-motion";

interface Action {
  id: string;
  icon: string;
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}

interface StudioActionsDialogProps {
  open: boolean;
  onClose: () => void;
  actions: Action[];
}

export default function StudioActionsDialog({ open, onClose, actions }: StudioActionsDialogProps) {
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
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 12 }}
            transition={{ type: "spring", damping: 22, stiffness: 300 }}
            className="fixed z-50 left-4 top-1/2 -translate-y-1/2 w-72 rounded-2xl p-4 flex flex-col gap-2"
            style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#9494B8" }}>
                Studio Actions
              </span>
              <button
                onClick={onClose}
                className="p-1 rounded-lg transition-colors"
                style={{ color: "#9494B8" }}
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {actions.map((action) => (
              <motion.button
                key={action.id}
                whileHover={{ scale: action.disabled ? 1 : 1.02 }}
                whileTap={{ scale: action.disabled ? 1 : 0.98 }}
                onClick={() => {
                  if (!action.disabled) {
                    action.onClick();
                    onClose();
                  }
                }}
                disabled={action.disabled}
                className="flex items-start gap-3 p-3 rounded-xl text-left transition-colors w-full"
                style={{
                  backgroundColor: action.disabled ? "transparent" : "rgba(129,140,248,0.06)",
                  border: `1px solid ${action.disabled ? "#2E2E40" : "#818CF8"}`,
                  opacity: action.disabled ? 0.4 : 1,
                  cursor: action.disabled ? "not-allowed" : "pointer",
                }}
              >
                <span className="text-2xl flex-shrink-0">{action.icon}</span>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold" style={{ color: "#EEEEFF" }}>
                    {action.label}
                  </span>
                  <span className="text-xs mt-0.5" style={{ color: "#9494B8" }}>
                    {action.description}
                  </span>
                </div>
              </motion.button>
            ))}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
