"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Briefcase, Clock, Edit3, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { createService, deleteService, toggleServiceStatus, updateService } from "../services/actions";
import { Field, getPlaceholdersByBusinessType, ReadOnlyBanner } from "../components/settings-shared";
import type { SettingsService } from "../types";

const DURATION_OPTIONS = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1 hora" },
  { value: 90, label: "1h 30min" },
  { value: 120, label: "2 horas" },
];

export function ServicesTab({
  companyId,
  services,
  businessType,
  isReadOnly = false,
}: {
  companyId?: string;
  services: SettingsService[];
  businessType?: string;
  isReadOnly?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ name: "", price: "", duration: 60, description: "" });

  const placeholders = getPlaceholdersByBusinessType(businessType);

  function startEdit(s: SettingsService) {
    setEditingId(s.id);
    setEditValues({
      name: s.name,
      price: s.price?.toString() ?? "",
      duration: s.duration,
      description: s.description ?? "",
    });
  }

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    if (companyId) formData.set("company_id", companyId);
    startTransition(async () => {
      try {
        await createService(formData);
        setIsAdding(false);
        toast.success("Serviço criado com sucesso!");
      } catch (err) {
        toast.error("Erro ao criar serviço: " + (err instanceof Error ? err.message : "Falha inesperada"));
      }
    });
  }

  function handleUpdate(id: string) {
    startTransition(async () => {
      try {
        await updateService(id, {
          name: editValues.name.trim(),
          price: editValues.price ? parseFloat(editValues.price) : null,
          duration: editValues.duration,
          description: editValues.description.trim() || null,
        });
        setEditingId(null);
        toast.success("Serviço atualizado!");
      } catch (err) {
        toast.error("Erro ao atualizar: " + (err instanceof Error ? err.message : "Falha inesperada"));
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja remover este serviço?")) return;
    startTransition(async () => {
      try {
        await deleteService(id);
        toast.success("Serviço removido.");
      } catch (err) {
        toast.error("Erro ao remover: " + (err instanceof Error ? err.message : "Falha inesperada"));
      }
    });
  }

  function handleToggleStatus(id: string, isPaused: boolean) {
    startTransition(async () => {
      try {
        await toggleServiceStatus(id, isPaused);
        toast.success(isPaused ? "Serviço pausado!" : "Serviço ativado!");
      } catch (err) {
        toast.error("Erro ao alterar status: " + (err instanceof Error ? err.message : "Falha inesperada"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {isReadOnly && <ReadOnlyBanner />}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold">Serviços</h3>
          <p className="text-xs text-[#71717A]">Gerencie os serviços que sua IA pode agendar.</p>
        </div>
        {!isReadOnly && (
          <Button
            variant="blue"
            size="sm"
            onClick={() => {
              setIsAdding(true);
              setEditingId(null);
            }}
            disabled={isAdding}
          >
            <Plus size={16} className="mr-2" /> Novo Serviço
          </Button>
        )}
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="border border-[#E4E4E7] bg-white p-5 rounded-xl"
          >
            <form onSubmit={handleAdd} className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nome do Serviço">
                  <Input name="name" placeholder={placeholders.singleService} required />
                </Field>
                <Field label="Preço (R$)">
                  <Input name="price" type="number" step="0.01" placeholder={placeholders.price} />
                </Field>
              </div>
              <Field label="Duração (minutos)">
                <select
                  name="duration"
                  className="w-full rounded-xl border border-[#E4E4E7] bg-white px-3.5 py-2.5 text-sm text-[#09090B] outline-none focus:border-[#2563EB]"
                  defaultValue="60"
                >
                  {DURATION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Descrição (opcional)">
                <textarea
                  name="description"
                  placeholder="Breve descrição para ajudar a IA a explicar o serviço..."
                  className="w-full rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] px-3.5 py-2.5 text-sm text-[#09090B] outline-none resize-none h-20"
                />
              </Field>
              <div className="flex justify-end gap-3">
                <Button variant="ghost" size="sm" type="button" onClick={() => setIsAdding(false)}>
                  Cancelar
                </Button>
                <Button variant="blue" size="sm" type="submit" disabled={pending}>
                  {pending ? "Salvando..." : "Salvar Serviço"}
                </Button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-3">
        {services.length === 0 && !isAdding && (
          <div className="text-center py-12 border border-dashed border-[#E4E4E7] bg-white rounded-xl">
            <p className="text-sm text-[#71717A]">Nenhum serviço cadastrado ainda.</p>
          </div>
        )}
        {services.map((s) =>
          editingId === s.id ? (
            <motion.div
              key={s.id}
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="border border-[#E4E4E7] bg-white p-4 rounded-xl"
            >
              <div className="grid gap-3 sm:grid-cols-2 mb-3">
                <Field label="Nome do Serviço">
                  <Input
                    value={editValues.name}
                    onChange={(e) => setEditValues((v) => ({ ...v, name: e.target.value }))}
                    required
                  />
                </Field>
                <Field label="Preço (R$)">
                  <Input
                    type="number"
                    step="0.01"
                    value={editValues.price}
                    onChange={(e) => setEditValues((v) => ({ ...v, price: e.target.value }))}
                  />
                </Field>
              </div>
              <Field label="Duração (minutos)">
                <select
                  value={editValues.duration}
                  onChange={(e) => setEditValues((v) => ({ ...v, duration: Number(e.target.value) }))}
                  className="w-full rounded-xl border border-[#E4E4E7] bg-white px-3.5 py-2.5 text-sm text-[#09090B] outline-none focus:border-[#2563EB]"
                >
                  {DURATION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex justify-end gap-2 mt-3">
                <Button variant="ghost" size="sm" type="button" onClick={() => setEditingId(null)}>
                  Cancelar
                </Button>
                <Button variant="blue" size="sm" type="button" onClick={() => handleUpdate(s.id)} disabled={pending}>
                  {pending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={s.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="border border-[#E4E4E7] bg-white flex items-center justify-between p-4 rounded-xl transition-all group"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="h-10 w-10 shrink-0 rounded-lg bg-brand-blue-500/10 flex items-center justify-center text-[#2563EB]">
                  <Briefcase size={20} />
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-sm truncate">{s.name}</h4>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[11px] text-[#71717A] flex items-center gap-1">
                      <Clock size={12} /> {s.duration} min
                    </span>
                    {s.price != null && (
                      <span className="text-[11px] text-[#0D9488] font-medium">
                        R${" "}
                        {new Intl.NumberFormat("pt-BR", {
                          style: "decimal",
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }).format(s.price)}
                      </span>
                    )}
                  </div>
                  {s.description && (
                    <p className="text-[10px] text-[#A1A1AA] mt-0.5 max-w-[200px] truncate">{s.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                <div className="flex items-center gap-2 mr-1">
                  <span className="text-[10px] uppercase tracking-wider text-[#71717A] font-bold">
                    {s.is_paused ? "Pausado" : "Ativo"}
                  </span>
                  <Switch
                    checked={!s.is_paused}
                    onChange={(val: boolean) => handleToggleStatus(s.id, !val)}
                    disabled={isReadOnly}
                  />
                </div>
                {!isReadOnly && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-[#71717A] hover:text-[#09090B]"
                      onClick={() => startEdit(s)}
                      aria-label="Editar serviço"
                    >
                      <Edit3 size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-[#71717A] hover:text-red-500"
                      onClick={() => handleDelete(s.id)}
                      aria-label="Remover serviço"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </>
                )}
              </div>
            </motion.div>
          ),
        )}
      </div>
    </div>
  );
}
