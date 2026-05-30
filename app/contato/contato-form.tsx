"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Mail,
  MessageCircle,
  Clock,
  Send,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Headphones,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const TOPIC_OPTIONS = [
  { value: "", label: "Selecione um assunto..." },
  { value: "demo", label: "Solicitar demonstração gratuita" },
  { value: "preco", label: "Dúvidas sobre preços e planos" },
  { value: "suporte", label: "Suporte técnico" },
  { value: "parceria", label: "Parceria ou revenda" },
  { value: "outro", label: "Outro assunto" },
];

const CONTACT_ITEMS = [
  {
    icon: Mail,
    title: "E-mail",
    value: "la181009@gmail.com",
    href: "mailto:la181009@gmail.com",
    iconBg: "bg-[#EFF6FF] border-[#BFDBFE]",
    iconColor: "text-[#2563EB]",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp",
    value: "+55 (11) 98994-0080",
    href: "https://wa.me/5511989940080",
    iconBg: "bg-[#F0FDFA] border-[#99F6E4]",
    iconColor: "text-[#0D9488]",
  },
  {
    icon: Clock,
    title: "Horário de Atendimento",
    value: "Seg–Sex · 09h às 18h",
    href: null,
    iconBg: "bg-[#FFF7ED] border-[#FED7AA]",
    iconColor: "text-[#EA580C]",
  },
] as const;

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export function ContatoForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao enviar mensagem.");
      }

      setIsSent(true);
      setFormData({ name: "", email: "", subject: "", message: "" });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ocorreu um erro inesperado."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="mx-auto max-w-[1200px]">
      {/* Back button */}
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-10"
      >
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#71717A] hover:text-[#09090B] transition-colors group"
        >
          <div className="h-7 w-7 rounded-lg border border-[#E4E4E7] bg-white shadow-sm grid place-items-center group-hover:border-[#D4D4D8] group-hover:bg-[#F4F4F5] transition-all">
            <ArrowLeft size={13} />
          </div>
          Voltar para o início
        </Link>
      </motion.div>

      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="text-center mb-14"
      >
        <Badge
          variant="cold"
          withDot={false}
          className="mb-5 text-[10px] font-bold uppercase tracking-widest rounded-full px-3.5 py-1.5"
        >
          Fale Conosco
        </Badge>

        <h1 className="text-[clamp(36px,5vw,56px)] font-bold tracking-tight text-[#09090B] leading-[1.1] mb-4">
          Como podemos{" "}
          <span className="text-[#2563EB]">te ajudar?</span>
        </h1>

        <p className="text-base md:text-lg text-[#3F3F46] max-w-lg mx-auto leading-relaxed">
          Nossa equipe responde em até 4 horas em dias úteis. Para suporte
          técnico urgente, acesse o dashboard diretamente.
        </p>
      </motion.section>

      {/* Two-column layout */}
      <div className="grid lg:grid-cols-[1fr_1.6fr] gap-8 items-start">
        {/* Left: contact info + support CTA */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-3"
        >
          {CONTACT_ITEMS.map((item) => (
            <motion.div key={item.title} variants={fadeUp}>
              <div className="flex items-center gap-4 rounded-2xl border border-[#E4E4E7] bg-white p-5 shadow-sm hover:border-[#D4D4D8] hover:shadow-md transition-all duration-200">
                <div
                  className={`h-11 w-11 rounded-xl border grid place-items-center shrink-0 ${item.iconBg}`}
                >
                  <item.icon size={19} className={item.iconColor} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#71717A] mb-0.5">
                    {item.title}
                  </p>
                  {item.href ? (
                    <a
                      href={item.href}
                      target={
                        item.href.startsWith("http") ? "_blank" : undefined
                      }
                      rel={
                        item.href.startsWith("http")
                          ? "noopener noreferrer"
                          : undefined
                      }
                      className="text-sm font-semibold text-[#09090B] hover:text-[#2563EB] transition-colors truncate block"
                    >
                      {item.value}
                    </a>
                  ) : (
                    <p className="text-sm font-semibold text-[#09090B]">
                      {item.value}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          ))}

          {/* Priority support */}
          <motion.div variants={fadeUp}>
            <div className="rounded-2xl border border-[#E4E4E7] bg-gradient-to-br from-[#EFF6FF] via-white to-[#F0FDFA] p-6 shadow-sm">
              <div className="flex items-start gap-3 mb-5">
                <div className="h-10 w-10 rounded-xl bg-white border border-[#BFDBFE] shadow-sm grid place-items-center shrink-0">
                  <Headphones size={17} className="text-[#2563EB]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#09090B] mb-1">
                    Suporte Prioritário
                  </h3>
                  <p className="text-xs text-[#71717A] leading-relaxed">
                    Clientes Pro têm acesso a chat em tempo real dentro do
                    dashboard — sem fila.
                  </p>
                </div>
              </div>
              <Link href="/login" className="block">
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-center text-xs"
                >
                  Ir para o Dashboard <ArrowRight size={13} />
                </Button>
              </Link>
            </div>
          </motion.div>
        </motion.div>

        {/* Right: form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="rounded-2xl border border-[#E4E4E7] bg-white shadow-[0_4px_32px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden">
            {/* Card header */}
            <div className="px-8 pt-8 pb-6 border-b border-[#E4E4E7]">
              <h2 className="text-base font-bold text-[#09090B]">
                Enviar mensagem
              </h2>
              <p className="text-sm text-[#71717A] mt-0.5">
                Preencha o formulário e entraremos em contato em breve.
              </p>
            </div>

            <div className="p-8">
              {isSent ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="text-center py-10"
                >
                  <div className="h-16 w-16 rounded-full bg-[#F0FDF4] border border-[#BBF7D0] grid place-items-center mx-auto mb-5">
                    <CheckCircle2 size={30} className="text-[#16A34A]" />
                  </div>
                  <h3 className="text-xl font-bold text-[#09090B] mb-2">
                    Mensagem enviada!
                  </h3>
                  <p className="text-sm text-[#71717A] mb-8 max-w-xs mx-auto leading-relaxed">
                    Obrigado por entrar em contato. Nossa equipe responderá em
                    até 4 horas em dias úteis.
                  </p>
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => setIsSent(false)}
                  >
                    Enviar outra mensagem
                  </Button>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-[#3F3F46]">
                        Nome completo
                      </label>
                      <Input
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="Lucas Gomes"
                        required
                        autoComplete="name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-[#3F3F46]">
                        E-mail
                      </label>
                      <Input
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        type="email"
                        placeholder="voce@empresa.com"
                        required
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[#3F3F46]">
                      Assunto
                    </label>
                    <div className="relative">
                      <select
                        name="subject"
                        value={formData.subject}
                        onChange={handleChange}
                        required
                        className="input w-full appearance-none cursor-pointer pr-9"
                      >
                        {TOPIC_OPTIONS.map((opt) => (
                          <option
                            key={opt.value}
                            value={opt.value}
                            disabled={opt.value === ""}
                          >
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                        >
                          <path
                            d="M2 4l4 4 4-4"
                            stroke="#A1A1AA"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-[#3F3F46]">
                        Mensagem
                      </label>
                      <span className="text-[11px] text-[#A1A1AA] tabular-nums">
                        {formData.message.length}/1000
                      </span>
                    </div>
                    <textarea
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      rows={5}
                      required
                      maxLength={1000}
                      placeholder="Descreva seu projeto, dúvida ou solicitação..."
                      className="input w-full resize-none"
                      style={{ minHeight: "140px" }}
                    />
                  </div>

                  {error && (
                    <div className="rounded-lg border border-[#FECACA] bg-[#FFF1F2] px-4 py-3">
                      <p className="text-xs font-medium text-[#DC2626]">
                        {error}
                      </p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    variant="orange"
                    size="lg"
                    className="w-full justify-center"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        Enviar Mensagem
                        <Send size={15} />
                      </>
                    )}
                  </Button>

                  <p className="text-center text-[11px] text-[#A1A1AA]">
                    Ao enviar, você concorda com nossa{" "}
                    <Link
                      href="/privacidade"
                      className="underline underline-offset-2 hover:text-[#71717A] transition-colors"
                    >
                      Política de Privacidade
                    </Link>
                    .
                  </p>
                </form>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
