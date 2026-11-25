"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, FileText, Loader2, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SafeClientOnly } from "@/components/ui/safe-client-only";
import { cn } from "@/lib/utils";
import type { PlanType } from "@/lib/billing/plans";
import { updatePersona } from "../actions";
import { PromptVersionHistory } from "../components/prompt-version-history";
import { FeatureGate, Field, ReadOnlyBanner } from "../components/settings-shared";
import type { PromptVersion, SettingsCompany, SettingsService } from "../types";

function ToneSelect({ defaultValue }: { defaultValue: string }) {
  const [selected, setSelected] = useState(defaultValue);
  const options = [
    { value: "cold", label: "Formal", desc: "Direto e objetivo" },
    { value: "warm", label: "Amigável", desc: "Equilibrado e empático" },
    { value: "hot", label: "Persuasivo", desc: "Focado em vendas" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="ai_tone" value={selected} />
      <div className="grid grid-cols-3 gap-2 p-1 bg-[#F4F4F5] rounded-xl border border-[#E4E4E7]">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setSelected(o.value)}
            className={cn(
              "relative px-3 py-2 text-xs font-bold transition-all rounded-lg z-10",
              selected === o.value ? "text-[#09090B]" : "text-[#71717A] hover:text-[#3F3F46]",
            )}
          >
            {o.label}
            {selected === o.value && (
              <motion.div
                layoutId="tone-slider"
                className="absolute inset-0 bg-brand-blue-500/20 border border-brand-blue-500/30 rounded-lg -z-10"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>
      <div className="text-[11px] text-[#1D4ED8]/70 italic text-center h-4">
        {options.find((o) => o.value === selected)?.desc}
      </div>
    </div>
  );
}

export function AiBrainTab({
  company,
  services,
  planType,
  isReadOnly = false,
  promptVersions = [],
}: {
  company: SettingsCompany | null;
  services: SettingsService[];
  planType?: PlanType | null;
  isReadOnly?: boolean;
  promptVersions?: PromptVersion[];
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<{ source_name: string; created_at: string; chunks: number }[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const pc = company?.persona_config ?? {};

  async function fetchDocs() {
    try {
      const res = await fetch("/api/knowledge");
      const data = await res.json();
      if (data.documents) setDocuments(data.documents);
    } catch {
      toast.error("Erro ao carregar documentos da base.");
    } finally {
      setLoadingDocs(false);
    }
  }

  useEffect(() => {
    fetchDocs();
  }, []);

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadStatus("Extraindo texto e gerando vetores...");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/knowledge", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao fazer upload");
      toast.success(`Documento "${file.name}" indexado com sucesso! 🎉`);
      fetchDocs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao processar arquivo");
    } finally {
      setUploading(false);
      setUploadStatus(null);
    }
  }

  async function handleDeleteDoc(sourceName: string) {
    if (!confirm(`Deseja remover o documento "${sourceName}"? Todos os vetores serão deletados.`)) return;
    try {
      const res = await fetch(`/api/knowledge?source_name=${encodeURIComponent(sourceName)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao excluir documento");
      }
      toast.success("Documento removido com sucesso!");
      fetchDocs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao deletar documento");
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        await updatePersona(formData);
        setSaved(true);
        toast.success("Configurações de IA salvas!");
        setTimeout(() => setSaved(false), 3000);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao salvar";
        setError(msg);
        toast.error(msg);
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {isReadOnly && <ReadOnlyBanner />}
        <fieldset disabled={isReadOnly} className="contents">
          <Card>
            <CardHeader>
              <CardTitle>Identidade</CardTitle>
              <CardDescription>Como a IA se apresenta e qual negócio representa.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nome da IA">
                  <Input name="ai_name" defaultValue={company?.ai_name ?? "Agendra"} />
                </Field>
                <Field label="Tipo de negócio">
                  <Input name="business_type" defaultValue={pc.business_type ?? ""} placeholder="Ex.: clínica estética, advocacia" />
                </Field>
              </div>
              <Field label="Áudio (TTS)">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    name="tts_enabled"
                    defaultChecked={pc.tts_enabled === true}
                    className="size-4 rounded border-[#D4D4D8] bg-[#FAFAFA]"
                  />
                  <span className="text-sm">
                    Responder por áudio quando o cliente mandar áudio
                    <span className="ml-2 text-xs text-[#71717A]">(Pro+)</span>
                  </span>
                </label>
              </Field>
              <Field label="Saudação padrão">
                <Input name="ai_greeting" defaultValue={company?.ai_greeting ?? "Oi! Sou a Agendra 👋"} />
              </Field>
              <Field label="Tom padrão">
                <ToneSelect defaultValue={company?.ai_tone ?? "warm"} />
              </Field>
              <Field label="Serviços oferecidos">
                <div className="flex flex-col gap-2 rounded-xl border border-brand-blue-500/10 bg-brand-blue-500/5 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[#3F3F46]">Gerenciado na aba &quot;Serviços&quot;</span>
                    <Link href="/settings?tab=services" className="text-[11px] font-bold text-[#2563EB] hover:underline">
                      Configurar →
                    </Link>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {services.length > 0 ? (
                      services.map((s) => (
                        <Badge
                          key={s.id}
                          variant="neutral"
                          className="border-brand-blue-500/20 bg-brand-blue-500/10 text-[#1D4ED8] text-[10px]"
                        >
                          {s.name}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-[10px] text-[#71717A] italic">Nenhum serviço configurado.</span>
                    )}
                  </div>
                </div>
              </Field>
            </CardContent>
          </Card>

          <FeatureGate
            planType={planType}
            requiredPlan="pro"
            title="Base de Conhecimento"
            desc="Faça upload de PDFs, Tabelas de Preços e treine sua IA com seus próprios dados."
          >
            <Card>
              <CardHeader>
                <CardTitle>Base de Conhecimento</CardTitle>
                <CardDescription>Treine a IA com catálogos, FAQs e tabelas de preços.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={async (e) => {
                    e.preventDefault();
                    setDragging(false);
                    if (e.dataTransfer.files.length > 0) await handleUpload(e.dataTransfer.files[0]);
                  }}
                  className={cn(
                    "group relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl transition-all duration-300",
                    dragging
                      ? "border-brand-blue-500 bg-brand-blue-500/10"
                      : "border-[#E4E4E7] bg-[#FAFAFA] hover:border-[#D4D4D8] hover:bg-[#F4F4F5]",
                    uploading || isReadOnly ? "pointer-events-none opacity-50" : "cursor-pointer",
                  )}
                >
                  <input
                    type="file"
                    onChange={async (e) => {
                      if (e.target.files?.[0]) await handleUpload(e.target.files[0]);
                    }}
                    disabled={uploading || isReadOnly}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    accept=".pdf,.txt,.docx"
                  />
                  <div className="h-14 w-14 rounded-full bg-[#F4F4F5] flex items-center justify-center text-[#A1A1AA] mb-4 ring-4 ring-[#E4E4E7]">
                    {uploading ? <Loader2 size={24} className="animate-spin text-[#2563EB]" /> : <UploadCloud size={24} className="text-[#3F3F46]" />}
                  </div>
                  {uploading ? (
                    <div className="text-center">
                      <p className="text-sm font-bold text-[#09090B] mb-1">Indexando arquivo...</p>
                      <p className="text-xs text-[#1D4ED8]/80 animate-pulse">{uploadStatus}</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm font-bold text-[#3F3F46] mb-1">Arrastar &amp; soltar ou clique para escolher</p>
                      <p className="text-xs text-[#71717A]">Suporta PDF, TXT ou DOCX até 5 MB</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3 mt-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#71717A]">Documentos Processados</h4>
                  {loadingDocs ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 size={20} className="animate-spin text-[#A1A1AA]" />
                    </div>
                  ) : documents.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {documents.map((doc) => (
                        <div
                          key={doc.source_name}
                          className="flex items-center justify-between p-3 rounded-xl border border-[#E4E4E7] bg-[#FAFAFA]"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-9 w-9 rounded-lg bg-brand-blue-500/10 flex items-center justify-center text-[#2563EB] shrink-0">
                              <FileText size={18} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-[#09090B] truncate max-w-[280px] sm:max-w-[400px]">
                                {doc.source_name}
                              </p>
                              <p className="text-[11px] text-[#71717A] mt-0.5">
                                {doc.chunks} blocos indexados •{" "}
                                <SafeClientOnly fallback="—">{new Date(doc.created_at).toLocaleDateString("pt-BR")}</SafeClientOnly>
                              </p>
                            </div>
                          </div>
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => handleDeleteDoc(doc.source_name)}
                              className="h-8 w-8 rounded-lg flex items-center justify-center text-[#A1A1AA] hover:text-red-500 hover:bg-red-500/10 transition"
                              aria-label={`Excluir ${doc.source_name}`}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 gap-2 text-center border border-dashed border-[#E4E4E7] rounded-xl bg-white">
                      <p className="text-[12px] text-[#71717A] font-semibold">Nenhum documento processado ainda</p>
                      <p className="text-[11px] text-[#A1A1AA] leading-relaxed max-w-xs px-4">
                        Envie FAQs, tabelas de preços ou materiais de treinamento para calibrar a IA.
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </FeatureGate>

          <Card>
            <CardHeader>
              <CardTitle>Comportamento</CardTitle>
              <CardDescription>Instruções específicas para o seu negócio.</CardDescription>
            </CardHeader>
            <CardContent>
              <Field label="Instruções adicionais">
                <textarea
                  name="extra_instructions"
                  defaultValue={pc.extra_instructions ?? ""}
                  placeholder="Ex.: Sempre mencionar que a consulta inicial é gratuita..."
                  rows={4}
                  maxLength={3000}
                  className="w-full rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] px-3.5 py-2.5 text-sm text-[#09090B] outline-none resize-none focus:border-[#2563EB]"
                />
                <p className="text-[10px] mt-1 text-[#71717A]">
                  Essas instruções são injetadas diretamente no contexto da IA. Máx. 3.000 caracteres.
                </p>
              </Field>
              <Field label="Frases proibidas">
                <Input
                  name="ai_forbidden"
                  defaultValue={company?.ai_forbidden ?? ""}
                  placeholder="Ex.: 'desculpe pelo transtorno', 'não posso ajudar'"
                />
                <p className="text-[10px] mt-1 text-[#71717A]">
                  Separe por vírgula. A IA vai evitar essas expressões.
                </p>
              </Field>
              {error && <p className="mb-4 text-xs text-red-500 font-medium">{error}</p>}
              <Button type="submit" variant="orange" size="sm" className="w-full justify-center h-11" disabled={pending}>
                {saved ? (
                  <>
                    <Check size={14} className="mr-1.5" /> Salvo ✓
                  </>
                ) : pending ? (
                  "Salvando…"
                ) : (
                  "Salvar configurações"
                )}
              </Button>
            </CardContent>
          </Card>
        </fieldset>
      </form>
      <PromptVersionHistory promptVersions={promptVersions} isReadOnly={isReadOnly} />
    </div>
  );
}
