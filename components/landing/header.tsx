"use client";

import React, { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "#como",     label: "Como funciona" },
  { href: "#produto",  label: "Produto" },
  { href: "#casos",    label: "Casos" },
  { href: "#preco",    label: "Preço" },
];

const HEADER_HEIGHT = 68;

function smoothScrollTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;

  const top = el.getBoundingClientRect().top + window.scrollY - HEADER_HEIGHT - 8;

  window.scrollTo({
    top: Math.max(0, top),
    behavior: "smooth",
  });
}

function NavLink({
  href,
  children,
  onClick,
  className,
  style,
}: {
  href: string;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (href.startsWith("#")) {
        e.preventDefault();
        smoothScrollTo(href.slice(1));
        onClick?.();
      }
    },
    [href, onClick],
  );

  return (
    <a href={href} onClick={handleClick} className={className} style={style}>
      {children}
    </a>
  );
}

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let ticking = false;
    let lastState = window.scrollY > 8;
    setScrolled(lastState);
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const next = window.scrollY > 8;
        if (next !== lastState) {
          lastState = next;
          setScrolled(next);
        }
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b backdrop-blur-xl backdrop-saturate-150 transition-colors duration-300",
        scrolled
          ? "border-white/[0.14] bg-[rgba(11,18,34,0.78)]"
          : "border-white/[0.08] bg-[rgba(11,18,34,0.55)]",
      )}
    >
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/assets/agendra-logo.svg"
            alt="Agendra - Inteligência Artificial para Agendamento"
            width={120}
            height={30}
            style={{ height: "auto" }}
            priority
          />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.href}
              href={n.href}
              className="text-sm font-medium transition-colors hover:text-white"
              style={{ color: "var(--color-fg-2)" } as React.CSSProperties}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link href="/login">
            <Button variant="ghost" size="sm">Entrar</Button>
          </Link>
          <Link href="/signup">
            <Button variant="primary" size="sm">Começar grátis</Button>
          </Link>
        </div>

        <button
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          onClick={() => setOpen((v) => !v)}
          className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-white md:hidden"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden border-t border-white/[0.08] md:hidden"
          >
            <div className="flex flex-col gap-1 px-6 py-4">
              {NAV.map((n) => (
                <NavLink
                  key={n.href}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.04]"
                >
                  {n.label}
                </NavLink>
              ))}
              <div className="mt-3 flex gap-2">
                <Link href="/login" className="flex-1">
                  <Button variant="secondary" size="sm" className="w-full justify-center">Entrar</Button>
                </Link>
                <Link href="/signup" className="flex-1">
                  <Button variant="primary" size="sm" className="w-full justify-center">Começar grátis</Button>
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
