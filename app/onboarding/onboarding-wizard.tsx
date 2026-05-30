"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { type OnboardingData, ONBOARDING_TOTAL_STEPS } from "@/lib/onboarding/types";
import { saveOnboardingStep, completeOnboarding } from "@/app/onboarding/actions";
import { OnboardingProgress } from "@/app/onboarding/components/onboarding-progress";
import { StepEmpresa } from "@/app/onboarding/components/steps/step-empresa";
import { StepObjetivo } from "@/app/onboarding/components/steps/step-objetivo";
import { StepCanais } from "@/app/onboarding/components/steps/step-canais";
import { StepIA } from "@/app/onboarding/components/steps/step-ia";
import { StepMetas } from "@/app/onboarding/components/steps/step-metas";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";

interface OnboardingWizardProps {
  initialStep: number;
  initialData: Partial<OnboardingData>;
}

const STEPS: {
  title: string;
  subtitle: string;
  component: React.ComponentType<{ data: Partial<OnboardingData>; onChange: (patch: Partial<OnboardingData>) => void }>;
  validate?: (data: Partial<OnboardingData>) => string | null;
}[] = [
  {
    title: "Sua Empresa",
    subtitle: "Vamos começar conhecendo o seu negócio.",
    component: StepEmpresa,
    validate: (d) => {
      if (!d.company_name?.trim()) return "Informe o nome da empresa.";
      if (!d.niche) return "Selecione o segmento do seu negócio.";
      return null;
    },
  },
  {
    title: "Seu Objetivo",
    subtitle: "O que você espera alcançar com a Agendra?",
    component: StepObjetivo,
    validate: (d) => {
      if (!d.goal) return "Selecione seu objetivo principal.";
      return null;
    },
  },
  {
    title: "Seus Canais",
    subtitle: "Por onde seus leads chegam até você?",
    component: StepCanais,
    validate: (d) => {
      if (!d.channels?.length) return "Selecione ao menos um canal.";
      return null;
    },
  },
  {
    title: "Sua IA",
    subtitle: "Configure como a IA vai se comportar nas conversas.",
    component: StepIA,
    validate: (d) => {
      if (!d.ai_name?.trim()) return "Dê um nome para sua assistente virtual.";
      if (!d.ai_tone) return "Escolha o tom de comunicação da IA.";
      return null;
    },
  },
  {
    title: "Suas Metas",
    subtitle: "Últimos ajustes para maximizar seus resultados.",
    component: StepMetas,
  },
];

export function OnboardingWizard({ initialStep, initialData }: OnboardingWizardProps) {
  const router = useRouter();

  const [step, setStep] = useState(initialStep);
  const [data, setData] = useState<Partial<OnboardingData>>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [direction, setDirection] = useState(1);

  const isLastStep = step === ONBOARDING_TOTAL_STEPS - 1;
  const { title, subtitle, component: StepComponent, validate } = STEPS[step];

  useEffect(() => {
    trackEvent("onboarding_start");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(patch: Partial<OnboardingData>) {
    setData((prev) => ({ ...prev, ...patch }));
    // Clear inline error on any change
    if (error) setError(null);
  }

  function handleBack() {
    if (step === 0 || saving) return;
    setDirection(-1);
    setStep((s) => s - 1);
    setError(null);
  }

  async function handleNext() {
    // Client-side validation before saving
    if (validate) {
      const msg = validate(data);
      if (msg) {
        setError(msg);
        return;
      }
    }

    setError(null);
    setSaving(true);

    try {
      if (isLastStep) {
        const result = await completeOnboarding(data as OnboardingData);
        if (result.ok) {
          trackEvent("onboarding_complete");
          router.push("/inbox");
        } else {
          setError(result.error ?? "Ocorreu um erro ao concluir o onboarding.");
        }
      } else {
        setDirection(1);
        await saveOnboardingStep(step + 1, data);
        setStep((s) => s + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-[#FAFAFA]">
      <div className="w-full max-w-lg bg-white border border-[#E4E4E7] rounded-3xl p-8 shadow-sm">
        {/* Logo */}
        <div className="text-2xl font-bold text-[#09090B] mb-8 text-center tracking-tight">
          agendra
        </div>

        {/* Progress */}
        <div className="mb-6">
          <OnboardingProgress current={step + 1} total={ONBOARDING_TOTAL_STEPS} />
        </div>

        {/* Step header */}
        <h1 className="text-xl font-semibold text-[#09090B] mb-0.5">{title}</h1>
        <p className="text-sm text-[#71717A] mb-6">{subtitle}</p>

        {/* Step content */}
        <div className="relative overflow-hidden">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={step}
              initial={{ x: direction * 60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -direction * 60, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 35 }}
            >
              <StepComponent data={data} onChange={handleChange} />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#FEF2F2] border border-[#FEE2E2] px-4 py-3">
            <span className="text-[#DC2626] text-base">⚠</span>
            <p className="text-[#DC2626] text-sm">{error}</p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 gap-3">
          {step > 0 ? (
            <Button variant="ghost" size="md" onClick={handleBack} disabled={saving}>
              Voltar
            </Button>
          ) : (
            <div />
          )}

          <Button
            variant={isLastStep ? "orange" : "primary"}
            size="lg"
            onClick={handleNext}
            disabled={saving}
            className="min-w-[120px]"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Salvando...
              </span>
            ) : isLastStep ? "Concluir 🚀" : "Continuar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
