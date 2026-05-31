// app/admin/layout.tsx
import { ReactNode } from "react";
import { MotionProvider } from "@/components/motion/motion-provider";

export const metadata = {
  title: "Painel de Comando Admin | Agendra",
  description: "Exclusivo do proprietário do sistema",
  robots: "noindex, nofollow" // Secret panel, hide from all search engine bots completely
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <MotionProvider>
      <div className="min-h-screen bg-[#FAFAFA] font-sans antialiased text-[#09090B]">
        {children}
      </div>
    </MotionProvider>
  );
}
