// app/admin/components/json-modal.tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Check } from "lucide-react";
import { useState } from "react";

interface JsonModalProps {
  open: boolean;
  title?: string;
  data: unknown;
  onClose: () => void;
}

function syntaxHighlight(json: string): string {
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = "text-[#71717A]"; // number
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? "text-[#2563EB] font-semibold" : "text-[#16A34A]";
      } else if (/true|false/.test(match)) {
        cls = "text-[#EA580C]";
      } else if (/null/.test(match)) {
        cls = "text-[#DC2626]";
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

export function JsonModal({ open, title, data, onClose }: JsonModalProps) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);

  function handleCopy() {
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
            className="relative bg-white border border-[#E4E4E7] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4E4E7] bg-[#F4F4F5]">
              <span className="text-sm font-semibold text-[#09090B] font-mono">
                {title || "Payload"}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 text-xs text-[#71717A] hover:text-[#09090B] transition-colors px-2 py-1 rounded-lg hover:bg-white border border-transparent hover:border-[#E4E4E7]"
                >
                  {copied ? <Check size={12} className="text-[#16A34A]" /> : <Copy size={12} />}
                  {copied ? "Copiado" : "Copiar"}
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-[#71717A] hover:text-[#09090B] hover:bg-white border border-transparent hover:border-[#E4E4E7] transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="overflow-auto flex-1 p-5">
              <pre
                className="text-xs font-mono leading-relaxed whitespace-pre-wrap break-all"
                dangerouslySetInnerHTML={{ __html: syntaxHighlight(json) }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
