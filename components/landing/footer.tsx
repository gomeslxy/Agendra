"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Github, Linkedin, Twitter, Instagram, MessageCircle, ArrowUpRight, CheckCircle2 } from "lucide-react";

const NAVIGATION = {
  produto: [
    { name: "Como funciona", href: "#como-funciona" },
    { name: "Recursos", href: "#recursos" },
    { name: "Preços", href: "#precos" },
    { name: "Demo", href: "#demo" },
  ],
  empresa: [
    { name: "Sobre", href: "/sobre" },
    { name: "Blog", href: "/blog" },
    { name: "Contato", href: "/contato" },
  ],
  legal: [
    { name: "Termos de Uso", href: "/termos" },
    { name: "Privacidade", href: "/privacidade" },
    { name: "LGPD", href: "/lgpd" },
  ]
};

export function Footer() {
  return (
    <footer id="footer" className="relative mt-20 overflow-hidden border-t border-white/[0.08] bg-ink-950/50 pt-20 pb-10">
      {/* Decorative aurora background blur */}
      <div className="absolute -bottom-20 left-1/2 -z-10 h-[400px] w-[600px] -translate-x-1/2 rounded-[100%] bg-brand-blue-600/10 blur-[120px]" />
      
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
          
          {/* Brand Column */}
          <div className="lg:col-span-4">
            <Link href="/" className="inline-block transition-opacity hover:opacity-80">
              <Image 
                src="/assets/agendra-logo.svg" 
                alt="Agendra - IA para Qualificação de Leads" 
                width={120} 
                height={30} 
                className="brightness-110"
              />
            </Link>
            <p className="mt-6 max-w-xs text-sm leading-relaxed text-fg-3">
              Revolucionando o atendimento inicial com IA. 
              Respondemos seus leads em segundos, qualificamos em tempo real e agendamos suas vendas 24/7.
            </p>
            
            {/* System Status */}
            <div className="mt-8 flex items-center gap-2">
              <div className="flex h-6 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400 border border-emerald-500/20">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                </span>
                Sistemas Operacionais
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-8 lg:ml-auto">
            <div>
              <h3 className="text-xs font-semibold tracking-widest text-fg-2 uppercase mb-6">Produto</h3>
              <ul className="space-y-4">
                {NAVIGATION.produto.map((item) => (
                  <li key={item.name}>
                    <Link href={item.href} className="group flex items-center text-sm text-fg-3 transition-colors hover:text-white">
                      {item.name}
                      <ArrowUpRight className="ml-1 h-3 w-3 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold tracking-widest text-fg-2 uppercase mb-6">Empresa</h3>
              <ul className="space-y-4">
                {NAVIGATION.empresa.map((item) => (
                  <li key={item.name}>
                    <Link href={item.href} className="text-sm text-fg-3 transition-colors hover:text-white">
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold tracking-widest text-fg-2 uppercase mb-6">Legal</h3>
              <ul className="space-y-4">
                {NAVIGATION.legal.map((item) => (
                  <li key={item.name}>
                    <Link href={item.href} className="text-sm text-fg-3 transition-colors hover:text-white">
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-20 flex flex-col items-center justify-between gap-6 border-t border-white/[0.06] pt-10 sm:flex-row">
          <p className="text-xs text-fg-3">
            © 2026 Agendra Technologies. Todos os direitos reservados.
          </p>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-xs text-fg-3">
              <CheckCircle2 className="h-3.5 w-3.5 text-brand-teal-400" />
              <span>Protegido por Supabase RLS</span>
            </div>
            <div className="h-4 w-[1px] bg-white/[0.08]" />
            <p className="text-xs text-fg-3">
              Desenvolvido por <span className="text-white font-medium">Lucas Gomes do Amaral</span>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

