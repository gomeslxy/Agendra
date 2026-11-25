"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, Paperclip, Send, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface InboxComposerProps {
  leadId: string;
  isAutonomous: boolean;
  sendPending: boolean;
  takePending: boolean;
  onTakeOver: () => void;
  onSendText: (content: string) => void;
  onSendAttachment: (file: File, caption: string) => void;
}

export function InboxComposer({
  leadId,
  isAutonomous,
  sendPending,
  takePending,
  onTakeOver,
  onSendText,
  onSendAttachment,
}: InboxComposerProps) {
  const [noteText, setNoteText] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachPreview, setAttachPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const inputBlocked = isAutonomous || sendPending;

  useEffect(() => {
    if (!sendPending && !takePending) {
      inputRef.current?.focus();
    }
  }, [sendPending, takePending, leadId]);

  const clearAttachment = useCallback(() => {
    if (attachPreview) URL.revokeObjectURL(attachPreview);
    setAttachedFile(null);
    setAttachPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [attachPreview]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx 16 MB)");
      return;
    }
    setAttachedFile(file);
    if (file.type.startsWith("image/")) {
      setAttachPreview(URL.createObjectURL(file));
    } else {
      setAttachPreview(null);
    }
  }

  function handleSubmit() {
    if (attachedFile) {
      const file = attachedFile;
      const caption = noteText.trim();
      clearAttachment();
      setNoteText("");
      onSendAttachment(file, caption);
      return;
    }

    if (!noteText.trim()) return;
    const content = noteText.trim();
    setNoteText("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    onSendText(content);
  }

  return (
    <div className="relative bg-white border-t border-[#E4E4E7] p-3 sm:p-4">
      <div className="max-w-5xl mx-auto relative group">
        <AnimatePresence>
          {isAutonomous && (
            <motion.div
              suppressHydrationWarning
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 backdrop-blur-[1.5px] rounded-2xl"
            >
              <Button
                variant="orange"
                size="sm"
                className="gap-2 px-6 h-10 rounded-full font-black uppercase tracking-wider"
                onClick={onTakeOver}
                disabled={takePending}
              >
                {takePending ? <Zap size={16} className="animate-spin" /> : <Zap size={16} fill="currentColor" />}
                Assumir Atendimento
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf,video/mp4,video/3gpp,audio/mpeg,audio/ogg,audio/mp4,audio/aac,audio/amr"
          className="hidden"
          onChange={handleFileSelect}
        />

        <div
          suppressHydrationWarning
          className={cn(
            "flex items-center gap-2 sm:gap-3 transition-all duration-200",
            isAutonomous && "blur-[1px] opacity-40 scale-[0.99] pointer-events-none",
          )}
        >
          <div className="flex-1 relative flex flex-col gap-0 bg-[#F4F4F5] border border-[#E4E4E7] rounded-2xl px-3 py-1.5 transition-all focus-within:border-[#2563EB] focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.10)]">
            {attachedFile && (
              <div className="flex items-center gap-2 pt-2 pb-1">
                <div className="flex items-center gap-2 rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-[11px] max-w-[220px]">
                  {attachPreview ? (
                    <img src={attachPreview} alt="" className="h-5 w-5 rounded object-cover shrink-0" />
                  ) : (
                    <FileText size={13} className="shrink-0 text-[#71717A]" />
                  )}
                  <span className="truncate text-[#3F3F46]">{attachedFile.name}</span>
                  <span className="shrink-0 text-[#A1A1AA]">{(attachedFile.size / 1024).toFixed(0)}KB</span>
                </div>
                <button
                  type="button"
                  onClick={clearAttachment}
                  aria-label="Remover anexo"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F4F4F5] hover:bg-[#E4E4E7] transition-colors"
                >
                  <X size={10} className="text-[#71717A]" />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-9 w-9 rounded-xl p-0 shrink-0 mb-0.5 transition-colors",
                  attachedFile && "bg-[#EFF6FF] text-[#2563EB] hover:bg-[#DBEAFE]",
                )}
                disabled={inputBlocked}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Anexar arquivo"
              >
                <Paperclip size={18} className={cn(attachedFile ? "text-[#2563EB]" : "text-[#A1A1AA]")} />
              </Button>
              <textarea
                ref={inputRef}
                rows={1}
                placeholder={attachedFile ? "Legenda (opcional)..." : "Escreva uma mensagem..."}
                className="flex-1 bg-transparent py-2.5 text-[14px] text-[#09090B] outline-none placeholder:text-[#A1A1AA] disabled:cursor-not-allowed resize-none max-h-32 custom-scrollbar"
                value={noteText}
                onChange={(e) => {
                  setNoteText(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!inputBlocked && (noteText.trim() || attachedFile)) handleSubmit();
                  }
                }}
                disabled={inputBlocked}
              />
            </div>
          </div>

          <Button
            variant="primary"
            size="sm"
            aria-label="Enviar mensagem"
            className={cn(
              "h-11 w-11 rounded-full shrink-0 transition-all duration-200 overflow-hidden z-10",
              noteText.trim() || attachedFile ? "scale-100 opacity-100" : "scale-90 opacity-40",
            )}
            disabled={inputBlocked || (!noteText.trim() && !attachedFile)}
            onClick={handleSubmit}
          >
            {sendPending ? <Zap size={18} className="animate-spin" /> : <Send size={18} />}
          </Button>
        </div>
      </div>
    </div>
  );
}
