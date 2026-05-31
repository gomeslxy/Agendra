// app/admin/components/confirm-modal.tsx
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  /** If set, user must type this string to confirm */
  confirmText?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmText,
  confirmLabel = "Confirmar",
  danger = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const [typed, setTyped] = useState("");
  const canConfirm = !confirmText || typed === confirmText;

  function handleConfirm() {
    if (!canConfirm) return;
    setTyped("");
    onConfirm();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <motion.div
            className="relative bg-white border border-[#E4E4E7] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className={`p-2 rounded-xl ${danger ? "bg-[#FFF1F2]" : "bg-[#FFFBEB]"}`}>
                  <AlertTriangle
                    size={18}
                    className={danger ? "text-[#DC2626]" : "text-[#D97706]"}
                  />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-[#09090B]">{title}</h3>
                  <p className="text-sm text-[#71717A] mt-1">{description}</p>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-[#71717A] hover:text-[#09090B] hover:bg-[#F4F4F5] transition-colors"
                >
                  <X size={14} />
                </button>
              </div>

              {confirmText && (
                <div className="mb-4">
                  <p className="text-xs text-[#71717A] mb-2">
                    Digite <span className="font-mono font-bold text-[#09090B]">{confirmText}</span> para confirmar:
                  </p>
                  <input
                    type="text"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder={confirmText}
                    className="w-full border border-[#E4E4E7] rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#2563EB] bg-[#FAFAFA]"
                    autoFocus
                  />
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={onClose}>
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                  className={danger ? "!bg-[#DC2626] hover:!bg-[#B91C1C] text-white border-transparent" : ""}
                >
                  {confirmLabel}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
