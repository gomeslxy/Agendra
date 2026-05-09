import { ComingSoon } from "@/components/ui/coming-soon";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sobre a Agendra",
  description: "Conheça a missão da Agendra de automatizar o atendimento e qualificação de leads.",
};

export default function SobrePage() {
  return <ComingSoon title="Sobre a Agendra" />;
}
