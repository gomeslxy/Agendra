"use client";

import { SettingsNav } from "./components/settings-nav";
import type { SettingsTabId } from "./types";

export interface SettingsShellLayoutProps {
  activeTab: SettingsTabId;
  children: React.ReactNode;
}

export function SettingsShell({ activeTab, children }: SettingsShellLayoutProps) {
  return (
    <div className="mobile-scroll-area h-full overflow-y-auto px-4 pt-7 pb-6 lg:px-8 lg:py-7 relative">
      <header className="mb-6">
        <h1 className="text-[28px] font-bold tracking-[-0.02em]">Configurações</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-fg-2)" }}>
          Personalize Agendra para seu negócio.
        </p>
      </header>

      <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-start">
        <SettingsNav activeTab={activeTab} />
        <div
          role="tabpanel"
          id={`tabpanel-${activeTab}`}
          className="flex-1 w-full max-w-3xl min-w-0"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
