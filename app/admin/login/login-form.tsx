// app/admin/login/login-form.tsx
"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, ShieldAlert, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { verifyAdminPassword } from "../actions";
import { toast } from "sonner";

export function AdminLoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await verifyAdminPassword(password);
      if (!res.success) {
        setError(res.error || "Chave de segurança incorreta");
        toast.error("Acesso administrativo negado");
        setLoading(false);
        return;
      }

      toast.success("Acesso administrativo autorizado!");
      router.push("/admin");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Erro de rede ao autenticar");
      toast.error("Erro na validação do servidor");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-[#71717A]">
          Chave Secundária
        </label>
        <input
          type="password"
          required
          placeholder="••••••••••••••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          className="w-full px-3.5 py-2 text-sm bg-[#F4F4F5] border border-[#E4E4E7] rounded-lg focus:outline-none focus:border-[#D4D4D8] focus:ring-1 focus:ring-[#2563EB]/40 transition duration-150 disabled:opacity-50"
        />
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 rounded-lg border border-[#FECACA] bg-[#FFF1F2] px-4 py-3 text-xs text-[#DC2626]"
          role="alert"
        >
          <ShieldAlert size={14} className="shrink-0" />
          <span>{error}</span>
        </motion.div>
      )}

      <Button
        type="submit"
        variant="primary"
        className="w-full justify-center mt-2"
        disabled={loading || !password}
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <>
            Desbloquear Painel
            <ArrowRight size={16} />
          </>
        )}
      </Button>
    </form>
  );
}
