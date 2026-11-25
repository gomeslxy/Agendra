"use client";

import { Clock, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export interface CompanyQuietHoursState {
  reminders_quiet_hours_enabled: boolean;
  reminders_quiet_hours_start: string;
  reminders_quiet_hours_end: string;
}

interface CompanyQuietHoursFormProps {
  settings: CompanyQuietHoursState;
  onChange: React.Dispatch<React.SetStateAction<CompanyQuietHoursState>>;
  onSave: () => void;
  pending: boolean;
}

export function CompanyQuietHoursForm({
  settings,
  onChange,
  onSave,
  pending,
}: CompanyQuietHoursFormProps) {
  return (
    <div className="space-y-6">
      <Card className="border-[#E4E4E7] shadow-sm rounded-2xl bg-white">
        <CardHeader>
          <CardTitle className="text-base font-bold text-[#09090B] flex items-center gap-1.5">
            <Clock size={18} className="text-orange-500" />
            Horário Silencioso para Clientes (Lembretes)
          </CardTitle>
          <CardDescription className="text-xs text-[#71717A]">
            Evite disparos indesejados de WhatsApp para seus leads e clientes fora do horário comercial.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 p-1">
            <div>
              <p className="text-xs font-bold text-[#09090B]">Ativar horário de silêncio para lembretes</p>
              <p className="text-[10px] text-[#71717A]">
                Lembretes agendados para este período serão automaticamente postergados para a manhã seguinte.
              </p>
            </div>
            <Switch
              checked={settings.reminders_quiet_hours_enabled}
              onChange={(v: boolean) =>
                onChange((prev) => ({ ...prev, reminders_quiet_hours_enabled: v }))
              }
            />
          </div>

          {settings.reminders_quiet_hours_enabled && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[#71717A] uppercase tracking-wider">Silenciar das</label>
                <input
                  type="time"
                  value={settings.reminders_quiet_hours_start}
                  onChange={(e) =>
                    onChange((prev) => ({ ...prev, reminders_quiet_hours_start: e.target.value }))
                  }
                  className="h-10 rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] px-3 text-xs text-[#09090B] focus:border-[#2563EB] outline-none"
                />
              </div>
              <span className="text-[#A1A1AA] pt-4">–</span>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[#71717A] uppercase tracking-wider">Até as</label>
                <input
                  type="time"
                  value={settings.reminders_quiet_hours_end}
                  onChange={(e) =>
                    onChange((prev) => ({ ...prev, reminders_quiet_hours_end: e.target.value }))
                  }
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
          Salvar Configuração de Lembretes
        </Button>
      </div>
    </div>
  );
}
