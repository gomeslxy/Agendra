"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock, RefreshCw, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SafeClientOnly } from "@/components/ui/safe-client-only";
import { cn } from "@/lib/utils";
import { inviteTeamMember, updateCompany } from "../actions";
import { cancelInvitation, resendInvitation } from "../invitations/actions";
import { AuditLogsSection } from "../components/audit-logs-section";
import { Field, ReadOnlyBanner } from "../components/settings-shared";
import type { AuditLogRow, Member, PendingInvitation, SettingsCompany } from "../types";

const COLORS = [
  "linear-gradient(135deg,#3B82F6,#14B8A6)",
  "linear-gradient(135deg,#F97316,#FB923C)",
  "linear-gradient(135deg,#0F766E,#14B8A6)",
  "linear-gradient(135deg,#1D4ED8,#3B82F6)",
];

interface AccountTeamTabProps {
  memberships: Member[];
  company: SettingsCompany | null;
  pendingInvitations: PendingInvitation[];
  isReadOnly?: boolean;
  currentUserRole?: string;
  auditLogs?: AuditLogRow[];
}

export function AccountTeamTab({
  memberships,
  company,
  pendingInvitations,
  isReadOnly = false,
  currentUserRole = "member",
  auditLogs = [],
}: AccountTeamTabProps) {
  const [companyName, setCompanyName] = useState(company?.name ?? "");
  const [savingName, startNameTransition] = useTransition();
  const [nameSaved, setNameSaved] = useState(false);

  const [pendingList, setPendingList] = useState<PendingInvitation[]>(pendingInvitations);
  const [cancelPending, startCancelTransition] = useTransition();
  const [resendPending, startResendTransition] = useTransition();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [invitePending, startInviteTransition] = useTransition();

  function handleCancel(invitationId: string) {
    startCancelTransition(async () => {
      try {
        await cancelInvitation(invitationId);
        setPendingList((prev) => prev.filter((i) => i.id !== invitationId));
        toast.success("Convite cancelado.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao cancelar convite.");
      }
    });
  }

  function handleResend(invitationId: string) {
    startResendTransition(async () => {
      try {
        await resendInvitation(invitationId);
        toast.success("Convite reenviado com sucesso.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao reenviar convite.");
      }
    });
  }

  function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    startNameTransition(async () => {
      try {
        await updateCompany({ name: companyName });
        setNameSaved(true);
        toast.success("Dados da empresa atualizados!");
        setTimeout(() => setNameSaved(false), 3000);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao atualizar empresa.");
      }
    });
  }

  function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail || !inviteEmail.includes("@")) {
      toast.error("E-mail inválido.");
      return;
    }
    startInviteTransition(async () => {
      try {
        await inviteTeamMember(inviteEmail, inviteRole);
        toast.success(`Convite enviado para ${inviteEmail} 🎉`);
        setInviteOpen(false);
        setInviteEmail("");
        setInviteRole("member");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao enviar convite.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {isReadOnly && <ReadOnlyBanner />}
      <fieldset disabled={isReadOnly} className="contents">
        <Card>
          <CardHeader>
            <CardTitle>Empresa</CardTitle>
            <CardDescription>Informações do negócio cadastrado.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveName} className="flex flex-col gap-4">
              <Field label="Nome da empresa">
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ex.: Clínica Estética Silva"
                  required
                />
              </Field>
              <Button type="submit" variant="blue" size="sm" className="w-full font-bold" disabled={savingName}>
                {nameSaved ? (
                  <>
                    <Check size={14} className="mr-2" />
                    Salvo ✓
                  </>
                ) : savingName ? (
                  "Salvando…"
                ) : (
                  "Salvar empresa"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Time</CardTitle>
              <CardDescription>
                {memberships.length} {memberships.length === 1 ? "membro" : "membros"}
              </CardDescription>
            </div>
            {!isReadOnly && (
              <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)}>
                <UserPlus size={14} className="mr-2" />
                Convidar
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {memberships.map((m, i) => {
              const u = Array.isArray(m.users) ? m.users[0] : m.users;
              const name = u?.full_name ?? u?.email ?? "Usuário";
              const email = u?.email ?? "";
              const initials = name
                .split(" ")
                .slice(0, 2)
                .map((w: string) => w[0])
                .join("")
                .toUpperCase();
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] p-3"
                >
                  <div
                    className="grid h-9 w-9 place-items-center rounded-full text-xs font-bold text-white shadow-sm"
                    style={{ background: COLORS[i % COLORS.length] }}
                  >
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate">{name}</div>
                    <div className="text-[11px] truncate text-[#71717A]">{email}</div>
                  </div>
                  <Badge variant={m.role === "admin" ? "hot" : "cold"}>{m.role}</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {pendingList.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Convites Pendentes</CardTitle>
              <CardDescription>
                {pendingList.length} convite{pendingList.length !== 1 ? "s" : ""} aguardando resposta
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {pendingList.map((inv) => {
                  const daysLeft = Math.max(
                    0,
                    Math.ceil((new Date(inv.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
                  );
                  const expiresSoon = daysLeft <= 2;
                  return (
                    <motion.div
                      key={inv.id}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center gap-3 rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] p-3"
                    >
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-dashed border-[#D4D4D8] bg-[#F4F4F5] text-[#A1A1AA]">
                        <UserPlus size={15} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold truncate">{inv.invited_email}</div>
                        <div
                          className="text-[11px] flex items-center gap-1.5 flex-wrap"
                          style={{ color: expiresSoon ? "#F97316" : "var(--color-fg-3)" }}
                        >
                          <Clock size={10} />
                          {expiresSoon ? `Expira em ${daysLeft}d` : `${daysLeft} dias restantes`}
                          <span>·</span>
                          <Badge variant={inv.role === "admin" ? "hot" : "cold"}>{inv.role}</Badge>
                          <span>·</span>
                          <SafeClientOnly fallback="—">
                            Enviado {new Date(inv.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                          </SafeClientOnly>
                        </div>
                      </div>
                      {!isReadOnly && (
                        <div className="flex gap-1.5 shrink-0">
                          {expiresSoon && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[11px] text-[#0D9488]"
                              onClick={() => handleResend(inv.id)}
                              disabled={resendPending}
                            >
                              <RefreshCw size={12} className="mr-1" />
                              Reenviar
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px] text-red-500"
                            onClick={() => handleCancel(inv.id)}
                            disabled={cancelPending}
                          >
                            <Trash2 size={12} className="mr-1" />
                            Cancelar
                          </Button>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </CardContent>
          </Card>
        )}
      </fieldset>

      {(currentUserRole === "admin" || currentUserRole === "owner") && (
        <AuditLogsSection auditLogs={auditLogs} />
      )}

      <Dialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        titleId="invite-member-title"
        descriptionId="invite-member-desc"
        className="max-w-sm p-6"
      >
        <div className="flex flex-col gap-5">
          <div>
            <h3 id="invite-member-title" className="text-lg font-bold text-[#09090B]">
              Convidar membro do time
            </h3>
            <p id="invite-member-desc" className="text-sm text-[#71717A] mt-1">
              Convide alguém para gerenciar sua conta Agendra
            </p>
          </div>
          <form onSubmit={handleSendInvite} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-[#71717A]">E-mail</label>
              <Input
                type="email"
                placeholder="colega@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={invitePending}
                required
                className="h-9"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-[#71717A]">Perfil</label>
              <div className="grid grid-cols-2 gap-2">
                {(["member", "admin"] as const).map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setInviteRole(role)}
                    className={cn(
                      "py-2 rounded-lg text-xs font-bold transition-all",
                      inviteRole === role
                        ? "bg-brand-blue-500/20 border border-brand-blue-500/40 text-[#1D4ED8]"
                        : "bg-[#F4F4F5] border border-[#E4E4E7] text-[#71717A]",
                    )}
                  >
                    {role === "admin" ? "Admin" : "Membro"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => setInviteOpen(false)}
                disabled={invitePending}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="blue"
                size="sm"
                className="flex-1 font-bold"
                disabled={invitePending || !inviteEmail}
              >
                {invitePending ? "Enviando..." : "Enviar Convite"}
              </Button>
            </div>
          </form>
        </div>
      </Dialog>
    </div>
  );
}
