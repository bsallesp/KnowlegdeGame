"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import SettingsPanel from "@/components/SettingsPanel";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const router = useRouter();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60]"
            style={{ backgroundColor: "rgba(9,9,14,0.75)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
            aria-hidden
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", damping: 24, stiffness: 320 }}
            className="fixed z-[61] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-1.5rem)] max-w-lg max-h-[min(90vh,calc(100vh-2rem))] rounded-2xl flex flex-col overflow-hidden shadow-2xl"
            style={{ backgroundColor: "#09090E", border: "1px solid #2E2E40" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-4 py-3 flex-shrink-0"
              style={{ borderBottom: "1px solid #2E2E40" }}
            >
              <h2 id="settings-dialog-title" className="text-sm font-semibold" style={{ color: "#EEEEFF" }}>
                Settings
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: "#9494B8" }}
                aria-label="Close settings"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto px-4 py-6 flex-1 min-h-0">
              <SettingsPanel embedded />
            </div>

            <div className="px-4 pb-4 pt-2 flex-shrink-0" style={{ borderTop: "1px solid #2E2E40" }}>
              <motion.button
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  onClose();
                  router.push("/");
                }}
                className="w-full py-3 rounded-xl font-medium text-sm"
                style={{
                  backgroundColor: "transparent",
                  border: "1px solid #2E2E40",
                  color: "#9494B8",
                }}
              >
                New Topic
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
