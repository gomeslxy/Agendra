"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NAV, NavLink } from "./header";

/**
 * Mobile menu — isolated so framer-motion (AnimatePresence) is loaded lazily
 * via next/dynamic and stays out of the header's primary LCP/FCP bundle.
 */
export default function HeaderMobileMenu({
  open,
  isLoggedIn,
  onClose,
}: {
  open: boolean;
  isLoggedIn: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className="overflow-hidden border-t border-[#E4E4E7] bg-white md:hidden"
        >
          <div className="flex flex-col gap-1 px-6 py-4">
            {NAV.map((n) => (
              <NavLink
                key={n.href}
                href={n.href}
                onClick={onClose}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-[#3F3F46] transition-colors hover:bg-[#F4F4F5]"
              >
                {n.label}
              </NavLink>
            ))}
            <div className="mt-3 flex gap-2">
              {isLoggedIn ? (
                <Link href="/inbox" className="flex-1">
                  <Button variant="primary" size="sm" className="w-full justify-center">Ir para o Dashboard</Button>
                </Link>
              ) : (
                <>
                  <Link href="/login" className="flex-1">
                    <Button variant="secondary" size="sm" className="w-full justify-center">Entrar</Button>
                  </Link>
                  <Link href="/signup" className="flex-1">
                    <Button variant="primary" size="sm" className="w-full justify-center">Começar grátis</Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
