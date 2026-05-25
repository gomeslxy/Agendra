"use client";

import React, { useState } from "react";
import { Header } from "@/components/landing/header";
import { Footer } from "@/components/landing/footer";
import { motion } from "framer-motion";
import { 
  Mail, 
  MessageCircle, 
  MapPin, 
  Clock, 
  Send, 
  CheckCircle2, 
  ArrowLeft,
  ArrowRight
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function ContatoPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: ""
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
      setError(err instanceof Error ? err.message : "Ocorreu um erro inesperado.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="bg-aurora min-h-screen selection:bg-brand-blue-500/30">
      <Header />

      <main className="pt-24 pb-20 px-6">
        <div className="mx-auto max-w-[1200px]">
          {/* Back Button */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <Link 
              href="/" 
              className="inline-flex items-center gap-2 text-sm font-medium text-fg-3 hover:text-white transition-colors group"
            >
              <div className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] grid place-items-center group-hover:bg-white/10 group-hover:border-white/20 transition-all">
                <ArrowLeft size={14} />
              </div>
              Voltar para o início
            </Link>
          </motion.div>

          {/* Hero Section */}
          <section className="text-center mb-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <Badge variant="cold" className="mb-4 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest rounded-full">
                Fale Conosco
              </Badge>
              <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-white mb-6">
                Estamos aqui para <span className="text-gradient">te ajudar</span>
              </h1>
              <p className="text-lg text-fg-2 max-w-2xl mx-auto leading-relaxed">
                Tem alguma dúvida sobre como a Agendra pode transformar seu negócio? 
                Nossa equipe está pronta para responder suas perguntas.
              </p>
            </motion.div>
          </section>

          <div className="grid lg:grid-cols-[1fr_1.5fr] gap-8 items-start">
            {/* Contact Info Cards */}
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="space-y-4"
            >
              <Card className="border-white/[0.06] hover:border-white/10 transition-all">
                <CardHeader className="flex-row items-center gap-4 p-6">
                  <div className="h-12 w-12 rounded-2xl bg-brand-blue-500/10 grid place-items-center shrink-0 border border-brand-blue-500/20">
                    <Mail className="text-brand-blue-400" size={24} />
                  </div>
                  <div>
                    <CardTitle className="text-base">E-mail</CardTitle>
                    <CardDescription className="font-medium text-white/80 hover:text-white transition-colors">
                      <a href="mailto:la181009@gmail.com">la181009@gmail.com</a>
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>

              <Card className="border-white/[0.06] hover:border-white/10 transition-all">
                <CardHeader className="flex-row items-center gap-4 p-6">
                  <div className="h-12 w-12 rounded-2xl bg-brand-teal-500/10 grid place-items-center shrink-0 border border-brand-teal-500/20">
                    <MessageCircle className="text-brand-teal-400" size={24} />
                  </div>
                  <div>
                    <CardTitle className="text-base">WhatsApp</CardTitle>
                    <CardDescription className="font-medium text-white/80">+55 (11) 98994-0080</CardDescription>
                  </div>
                </CardHeader>
              </Card>

              <Card className="border-white/[0.06] hover:border-white/10 transition-all">
                <CardHeader className="flex-row items-center gap-4 p-6">
                  <div className="h-12 w-12 rounded-2xl bg-orange-spark/10 grid place-items-center shrink-0 border border-orange-spark/20">
                    <Clock className="text-orange-spark" size={24} />
                  </div>
                  <div>
                    <CardTitle className="text-base">Horário</CardTitle>
                    <CardDescription className="font-medium text-white/80 text-xs">
                      Segunda a Sexta · 09h às 18h
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>

              <div className="mt-8 p-6 rounded-3xl border border-white/[0.06] bg-white/[0.02] relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                  <CheckCircle2 size={120} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Suporte Prioritário</h3>
                <p className="text-sm text-fg-3 leading-relaxed mb-4">
                  Já é cliente Pro? Acesse seu dashboard para suporte prioritário em tempo real via chat.
                </p>
                <Button variant="ghost" className="p-0 h-auto hover:bg-transparent text-brand-blue-400 group-hover:text-brand-blue-300 transition-colors">
                  Ir para Dashboard <ArrowRight size={16} className="ml-2" />
                </Button>
              </div>
            </motion.div>

            {/* Contact Form */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <Card className="border-white/[0.08] shadow-2xl shadow-black/40 overflow-visible">
                <CardContent className="p-8 md:p-10">
                  {isSent ? (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-center py-12"
                    >
                      <div className="h-20 w-20 bg-brand-teal-500/20 rounded-full grid place-items-center mx-auto mb-6 border border-brand-teal-500/30">
                        <CheckCircle2 size={40} className="text-brand-teal-400" />
                      </div>
                      <h2 className="text-2xl font-bold text-white mb-3">Mensagem enviada!</h2>
                      <p className="text-fg-2 mb-8 max-w-sm mx-auto">
                        Obrigado por entrar em contato. Nossa equipe responderá sua mensagem em breve.
                      </p>
                      <Button variant="secondary" onClick={() => setIsSent(false)}>
                        Enviar outra mensagem
                      </Button>
                    </motion.div>
                  ) : (
                    <form onSubmit={handleSubmit} className="grid gap-6">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[11px] font-bold uppercase tracking-widest text-fg-3 ml-1">Nome</label>
                          <Input 
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            placeholder="Seu nome completo" 
                            required 
                            className="bg-white/[0.03] border-white/[0.08] focus:bg-white/[0.05]"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[11px] font-bold uppercase tracking-widest text-fg-3 ml-1">E-mail</label>
                          <Input 
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            type="email" 
                            placeholder="voce@empresa.com" 
                            required 
                            className="bg-white/[0.03] border-white/[0.08] focus:bg-white/[0.05]"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[11px] font-bold uppercase tracking-widest text-fg-3 ml-1">Assunto</label>
                        <Input 
                          name="subject"
                          value={formData.subject}
                          onChange={handleChange}
                          placeholder="Como podemos ajudar?" 
                          required 
                          className="bg-white/[0.03] border-white/[0.08] focus:bg-white/[0.05]"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[11px] font-bold uppercase tracking-widest text-fg-3 ml-1">Mensagem</label>
                        <textarea 
                          name="message"
                          value={formData.message}
                          onChange={handleChange}
                          rows={5}
                          required
                          placeholder="Descreva seu projeto ou dúvida..."
                          className="w-full rounded-2xl bg-white/[0.03] border border-white/[0.08] px-4 py-3 text-sm text-white outline-none focus:border-brand-blue-500/50 focus:bg-white/[0.05] focus:shadow-glow-blue/10 transition-all placeholder:text-fg-3/60"
                        />
                      </div>

                      {error && (
                        <p className="text-xs text-red-400 mt-1">{error}</p>
                      )}

                      <Button 
                        type="submit" 
                        variant="blue" 
                        size="lg" 
                        className="w-full h-12 text-sm font-bold shadow-lg shadow-brand-blue-500/20"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? (
                          <span className="flex items-center gap-2">
                            <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Enviando...
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            Enviar Mensagem <Send size={16} />
                          </span>
                        )}
                      </Button>
                    </form>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
