"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Copy, GitBranch, Loader2, Plus, Trash2, Zap } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { deleteWebhook, saveWebhookConfig } from "../actions";
import type { WebhookSubscription } from "../types";

export function WebhooksSection({
  webhooks,
  isPro,
  isReadOnly,
}: {
  webhooks: WebhookSubscription[];
  isPro: boolean;
  isReadOnly: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [events, setEvents] = useState<string[]>(["booking.created"]);
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleAdd() {
    if (!url || !url.startsWith("http")) {
      toast.error("URL inválida. Use https://...");
      return;
    }
    if (!events.length) {
      toast.error("Selecione ao menos um tipo de evento.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await saveWebhookConfig({ url, label: label || undefined, event_types: events });
        setUrl("");
        setLabel("");
        setEvents(["booking.created"]);
        setFormVisible(false);
        if (res?.secret) {
          setOneTimeSecret(res.secret);
        } else {
          toast.success("Webhook cadastrado com sucesso! 🎉");
        }
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao salvar webhook");
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Deseja realmente excluir este webhook?")) return;
    startTransition(async () => {
      try {
        await deleteWebhook(id);
        toast.success("Webhook excluído com sucesso!");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao excluir webhook");
      }
    });
  }

  async function handleCopySecret() {
    if (!oneTimeSecret) return;
    await navigator.clipboard.writeText(oneTimeSecret);
    setCopied(true);
    toast.success("Segredo copiado para a área de transferência.");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <div className={cn("rounded-xl border overflow-hidden relative", isPro ? "border-[#E4E4E7] bg-[#FAFAFA]" : "border-[#E4E4E7] bg-white")}>
        {!isPro && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/60 backdrop-blur-[3px]">
            <div className="flex flex-col items-center gap-2 text-center px-6">
              <div className="h-8 w-8 rounded-full bg-brand-blue-500/20 flex items-center justify-center">
                <Zap size={15} className="text-[#2563EB] animate-pulse" />
              </div>
              <p className="text-[12px] font-bold text-[#09090B]">Plano Pro</p>
              <p className="text-[11px] text-[#71717A] max-w-[180px] leading-relaxed">
                Webhooks para Zapier, Make e sistemas externos no plano Pro+
              </p>
              <Link href="/settings?tab=billing" className="mt-1 text-[11px] font-bold text-[#2563EB] hover:underline">
                Fazer upgrade →
              </Link>
            </div>
          </div>
        )}
        <button
          type="button"
          className={cn("w-full flex items-center gap-3 p-4 text-left", !isPro && "pointer-events-none")}
          onClick={() => isPro && setExpanded((v) => !v)}
        >
          <div className={cn("h-9 w-9 shrink-0 rounded-lg flex items-center justify-center", isPro ? "bg-brand-teal-500/15" : "bg-[#F4F4F5]")}>
            <GitBranch size={16} className={isPro ? "text-[#0D9488]" : "text-[#D4D4D8]"} />
          </div>
          <div className="flex-1 min-w-0">
            <div className={cn("text-[13px] font-semibold", isPro ? "text-[#09090B]" : "text-[#71717A]")}>
              Webhooks (Zapier / Make)
            </div>
            <div className="text-[11px] text-[#71717A] mt-0.5">
              {webhooks.length > 0
                ? `${webhooks.length} endpoint${webhooks.length > 1 ? "s" : ""} cadastrado${webhooks.length > 1 ? "s" : ""}`
                : "Envie eventos em tempo real para sistemas externos"}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isPro ? (
              <>
                <Badge variant="neutral" className="text-[10px] px-2 py-0.5 bg-brand-teal-500/10 text-[#0D9488] border-brand-teal-500/20">
                  {webhooks.length > 0 ? "Ativo" : "0 endpoints"}
                </Badge>
                <ChevronDown size={14} className={cn("text-[#A1A1AA] transition-transform duration-200", expanded && "rotate-180")} />
              </>
            ) : (
              <Badge variant="neutral" className="text-[10px] px-2 py-0.5 bg-brand-blue-500/10 text-[#1D4ED8] border-brand-blue-500/20">
                Pro+
              </Badge>
            )}
          </div>
        </button>

        <AnimatePresence>
          {expanded && isPro && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-[#E4E4E7]"
            >
              <div className="p-4 flex flex-col gap-4">
                {webhooks.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {webhooks.map((wh) => (
                      <div key={wh.id} className="flex items-center justify-between p-3 rounded-xl border border-[#E4E4E7] bg-white">
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-semibold text-[#09090B] truncate">{wh.label ?? wh.url}</p>
                          <p className="text-[10px] text-[#71717A] truncate">{wh.url}</p>
                          <p className="text-[10px] font-mono text-[#A1A1AA] mt-0.5">Segredo HMAC: ••••••••••••••••</p>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {wh.event_types.map((ev) => (
                              <span key={ev} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-brand-teal-500/10 text-[#0D9488] border border-brand-teal-500/20">
                                {ev}
                              </span>
                            ))}
                          </div>
                        </div>
                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={() => handleDelete(wh.id)}
                            className="ml-3 h-8 w-8 rounded-lg flex items-center justify-center text-[#A1A1AA] hover:text-red-500 hover:bg-red-500/10 transition shrink-0"
                            aria-label="Excluir webhook"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {formVisible ? (
                  <div className="flex flex-col gap-3 p-4 rounded-xl border border-brand-teal-500/20 bg-brand-teal-500/5">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-[#0D9488]">Novo Webhook</p>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-[#71717A]">URL do Endpoint *</label>
                      <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.zapier.com/hooks/catch/..." />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-[#71717A]">Nome amigável (opcional)</label>
                      <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Zapier CRM" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-[#71717A]">Eventos</label>
                      <div className="flex flex-wrap gap-2">
                        {["booking.created", "lead.status_changed", "followup.sent", "reminder.sent"].map((ev) => (
                          <button
                            key={ev}
                            type="button"
                            onClick={() => setEvents((prev) => (prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]))}
                            className={cn(
                              "text-[10px] font-mono px-2 py-1 rounded-lg border transition",
                              events.includes(ev)
                                ? "bg-brand-teal-500/20 border-brand-teal-500/40 text-[#0D9488]"
                                : "bg-[#F4F4F5] border-[#E4E4E7] text-[#71717A]",
                            )}
                          >
                            {ev}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="blue" size="sm" className="flex-1 font-bold" disabled={pending || !url} onClick={handleAdd}>
                        {pending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Plus size={14} className="mr-1.5" />}
                        Adicionar
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => { setFormVisible(false); setUrl(""); setLabel(""); }}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  !isReadOnly && (
                    <button
                      type="button"
                      onClick={() => setFormVisible(true)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-[#E4E4E7] text-[#71717A] hover:text-[#3F3F46] text-[12px] font-semibold transition"
                    >
                      <Plus size={14} />
                      Adicionar endpoint
                    </button>
                  )
                )}

                <div className="rounded-lg bg-brand-teal-500/5 border border-brand-teal-500/10 p-3">
                  <p className="text-[11px] text-[#71717A] leading-relaxed">
                    Cada requisição é assinada com HMAC-SHA256. Valide a assinatura no header{" "}
                    <code className="text-[#0D9488] text-[10px]">X-Agendra-Signature</code>.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Dialog
        open={Boolean(oneTimeSecret)}
        onClose={() => setOneTimeSecret(null)}
        titleId="webhook-secret-title"
        descriptionId="webhook-secret-desc"
        className="max-w-md p-6"
      >
        <h3 id="webhook-secret-title" className="text-base font-bold text-[#09090B]">
          Segredo HMAC do Webhook
        </h3>
        <p id="webhook-secret-desc" className="mt-1.5 text-xs text-[#71717A] leading-relaxed">
          Copie e guarde este segredo agora. Por segurança, ele é exibido uma única vez e não poderá ser recuperado depois.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] p-3">
          <code className="flex-1 break-all font-mono text-xs text-[#09090B]">{oneTimeSecret}</code>
          <Button type="button" variant="secondary" size="sm" onClick={handleCopySecret}>
            {copied ? <Check size={14} className="text-[#0D9488]" /> : <Copy size={14} />}
          </Button>
        </div>
        <div className="mt-5 flex justify-end">
          <Button type="button" variant="blue" size="sm" onClick={() => setOneTimeSecret(null)}>
            Entendido, já salvei
          </Button>
        </div>
      </Dialog>
    </>
  );
}
