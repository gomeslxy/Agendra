"use client";

import { Eye, Mail, Moon, Save, Smartphone, AlertTriangle, CreditCard, Info, UserPlus, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = {
  invite: "Convites de Equipe",
  member_joined: "Membros Entraram",
  member_left: "Membros Saíram",
  channel_error: "Erros de Integração",
  payment_failed: "Falhas de Pagamento",
  lead_hot: "Leads Quentes",
  system: "Alertas de Sistema",
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  invite: <UserPlus size={12} className="text-blue-500" />,
  member_joined: <Users size={12} className="text-teal-500" />,
  member_left: <Users size={12} className="text-gray-500" />,
  channel_error: <AlertTriangle size={12} className="text-red-500" />,
  payment_failed: <CreditCard size={12} className="text-red-500" />,
  lead_hot: <Zap size={12} className="text-orange-500" />,
  system: <Info size={12} className="text-gray-500" />,
};

export interface UserNotificationSettingsState {
  email_enabled: boolean;
  in_app_enabled: boolean;
  whatsapp_enabled: boolean;
  enabled_types: string[];
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

interface NotificationPreferencesFormProps {
  settings: UserNotificationSettingsState;
  onChange: React.Dispatch<React.SetStateAction<UserNotificationSettingsState>>;
  onSave: () => void;
  pending: boolean;
}

export function NotificationPreferencesForm({
  settings,
  onChange,
  onSave,
  pending,
}: NotificationPreferencesFormProps) {
  function toggleNotificationType(type: string) {
    onChange((prev) => {
      const active = prev.enabled_types.includes(type);
      return {
        ...prev,
        enabled_types: active
          ? prev.enabled_types.filter((t) => t !== type)
          : [...prev.enabled_types, type],
      };
    });
  }

  return (
    <div className="space-y-6">
      <Card className="border-[#E4E4E7] shadow-sm rounded-2xl bg-white">
        <CardHeader>
          <CardTitle className="text-base font-bold text-[#09090B]">Canais de Envio</CardTitle>
          <CardDescription className="text-xs text-[#71717A]">
            Escolha por onde deseja ser alertado sobre eventos da plataforma.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 p-3 rounded-xl border border-[#E4E4E7] hover:bg-[#FAFAFA] transition">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center border border-blue-100 text-blue-600">
                <Eye size={16} />
              </div>
              <div>
                <p className="text-xs font-bold text-[#09090B]">Notificações In-App (Sino)</p>
                <p className="text-[10px] text-[#71717A]">Visualização em tempo real no menu superior.</p>
              </div>
            </div>
            <Switch
              checked={settings.in_app_enabled}
              onChange={(v: boolean) => onChange((prev) => ({ ...prev, in_app_enabled: v }))}
            />
          </div>

          <div className="flex items-center justify-between gap-4 p-3 rounded-xl border border-[#E4E4E7] hover:bg-[#FAFAFA] transition">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-teal-50 flex items-center justify-center border border-teal-100 text-teal-600">
                <Mail size={16} />
              </div>
              <div>
                <p className="text-xs font-bold text-[#09090B]">Notificações por E-mail</p>
                <p className="text-[10px] text-[#71717A]">Envio automático de resumos dos eventos mais importantes.</p>
              </div>
            </div>
            <Switch
              checked={settings.email_enabled}
              onChange={(v: boolean) => onChange((prev) => ({ ...prev, email_enabled: v }))}
            />
          </div>

          <div className="flex items-center justify-between gap-4 p-3 rounded-xl border border-[#E4E4E7] hover:bg-[#FAFAFA] transition">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-orange-50 flex items-center justify-center border border-orange-100 text-orange-600">
                <Smartphone size={16} />
              </div>
              <div>
                <p className="text-xs font-bold text-[#09090B]">Notificações por WhatsApp</p>
                <p className="text-[10px] text-[#71717A]">Receber alertas direto no celular (exige número configurado).</p>
              </div>
            </div>
            <Switch
              checked={settings.whatsapp_enabled}
              onChange={(v: boolean) => onChange((prev) => ({ ...prev, whatsapp_enabled: v }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#E4E4E7] shadow-sm rounded-2xl bg-white">
        <CardHeader>
          <CardTitle className="text-base font-bold text-[#09090B]">Filtro de Eventos</CardTitle>
          <CardDescription className="text-xs text-[#71717A]">
            Selecione quais alertas do sistema você gostaria de receber.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(TYPE_LABELS).map(([type, label]) => {
            const active = settings.enabled_types.includes(type);
            return (
              <div
                key={type}
                onClick={() => toggleNotificationType(type)}
                className={cn(
                  "flex items-center justify-between gap-3 p-3 rounded-xl border transition cursor-pointer select-none",
                  active ? "border-[#BFDBFE] bg-[#EFF6FF]/20" : "border-[#E4E4E7] hover:bg-[#FAFAFA]",
                )}
              >
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded flex items-center justify-center bg-[#F4F4F5] border border-[#E4E4E7]">
                    {TYPE_ICON[type] || <Info size={12} />}
                  </div>
                  <span className="text-xs font-semibold text-[#3F3F46]">{label}</span>
                </div>
                <Switch checked={active} onChange={() => toggleNotificationType(type)} />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="border-[#E4E4E7] shadow-sm rounded-2xl bg-white">
        <CardHeader>
          <CardTitle className="text-base font-bold text-[#09090B] flex items-center gap-1.5">
            <Moon size={18} className="text-indigo-500" />
            Horário Silencioso Pessoal
          </CardTitle>
          <CardDescription className="text-xs text-[#71717A]">
            Suspenda notificações não-críticas durante o período selecionado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 p-1">
            <div>
              <p className="text-xs font-bold text-[#09090B]">Ativar período de silêncio</p>
              <p className="text-[10px] text-[#71717A]">Retém e-mails e alertas não urgentes durante a noite/folga.</p>
            </div>
            <Switch
              checked={settings.quiet_hours_enabled}
              onChange={(v: boolean) => onChange((prev) => ({ ...prev, quiet_hours_enabled: v }))}
            />
          </div>

          {settings.quiet_hours_enabled && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[#71717A] uppercase tracking-wider">Silenciar das</label>
                <input
                  type="time"
                  value={settings.quiet_hours_start}
                  onChange={(e) => onChange((prev) => ({ ...prev, quiet_hours_start: e.target.value }))}
                  className="h-10 rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] px-3 text-xs text-[#09090B] focus:border-[#2563EB] outline-none"
                />
              </div>
              <span className="text-[#A1A1AA] pt-4">–</span>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[#71717A] uppercase tracking-wider">Até as</label>
                <input
                  type="time"
                  value={settings.quiet_hours_end}
                  onChange={(e) => onChange((prev) => ({ ...prev, quiet_hours_end: e.target.value }))}
                  className="h-10 rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] px-3 text-xs text-[#09090B] focus:border-[#2563EB] outline-none"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={pending} className="bg-[#2563EB] hover:bg-[#1D4ED8]">
          <Save size={14} className="mr-1.5" />
          Salvar Preferências
        </Button>
      </div>
    </div>
  );
}
