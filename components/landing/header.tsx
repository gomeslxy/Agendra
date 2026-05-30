"use client";

import React, { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";

// Lazy-loaded: keeps framer-motion (AnimatePresence) out of the header's
// primary render bundle. Only fetched once the user opens the mobile menu.
const HeaderMobileMenu = dynamic(() => import("./header-mobile-menu"), { ssr: false });

export const NAV = [
  { href: "/#como-funciona", label: "Como funciona" },
  { href: "/#demo",          label: "Produto" },
  { href: "/#casos",         label: "Casos" },
  { href: "/planos",        label: "Planos" },
];

const HEADER_HEIGHT = 68;

function smoothScrollTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - HEADER_HEIGHT - 8;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

export function NavLink({
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
  const pathname = usePathname();
  const isHash = href.startsWith("#") || href.startsWith("/#");
  const hashTarget = href.includes("#") ? href.split("#")[1] : "";

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (isHash && pathname === "/") {
        e.preventDefault();
        smoothScrollTo(hashTarget);
        onClick?.();
      }
    },
    [isHash, pathname, hashTarget, onClick],
  );

  if (isHash && pathname === "/") {
    return (
      <a href={href} onClick={handleClick} className={className} style={style}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} onClick={onClick} className={className} style={style}>
      {children}
    </Link>
  );
}

interface HeaderProps {
  /** Pass from RSC page to avoid client-side getUser() waterfall */
  isLoggedIn?: boolean;
}

export function Header({ isLoggedIn = false }: HeaderProps = {}) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  // Mount-on-first-open: framer-motion chunk loads only after the user taps the
  // menu, while AnimatePresence exit animation is preserved across toggles.
  const [menuMounted, setMenuMounted] = useState(false);
  // Drives the pure-CSS entry animation (replaces motion.header initial/animate).
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    setEntered(true);
  }, []);

  function toggleMenu() {
    setMenuMounted(true);
    setOpen((v) => !v);
  }

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
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b backdrop-blur-xl backdrop-saturate-150",
        "transition-[colors,transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
        entered ? "translate-y-0 opacity-100" : "-translate-y-5 opacity-0",
        scrolled
          ? "border-[#E4E4E7] bg-white/80"
          : "border-zinc-200/50 bg-white/50",
      )}
    >
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/assets/agendra-logo.svg"
            alt="Agendra - Inteligência Artificial para Agendamento"
            width={120}
            height={30}
            style={{ width: "auto", height: "auto" }}
            priority
          />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.href}
              href={n.href}
              className="text-sm font-medium transition-colors hover:text-[#2563EB]"
              style={{ color: "var(--color-fg-2)" } as React.CSSProperties}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {isLoggedIn ? (
            <Link href="/inbox">
              <Button variant="primary" size="sm">Ir para o Dashboard</Button>
            </Link>
          ) : (
            <>
              <Link href="/login" onClick={() => trackEvent("cta_click", { location: "header", target: "login" })}>
                <Button variant="ghost" size="sm">Entrar</Button>
              </Link>
              <Link href="/signup" onClick={() => trackEvent("cta_click", { location: "header", target: "signup" })}>
                <Button variant="primary" size="sm">Começar grátis</Button>
              </Link>
            </>
          )}
        </div>

        <button
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          onClick={toggleMenu}
          className="grid h-10 w-10 place-items-center rounded-xl border border-[#E4E4E7] bg-white text-[#09090B] hover:bg-[#F4F4F5] transition-colors md:hidden"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {menuMounted && (
        <HeaderMobileMenu open={open} isLoggedIn={isLoggedIn} onClose={() => setOpen(false)} />
      )}
    </header>
  );
}
