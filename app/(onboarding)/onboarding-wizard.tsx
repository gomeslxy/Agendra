"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { type OnboardingData, ONBOARDING_TOTAL_STEPS } from "@/lib/onboarding/types";
import { saveOnboardingStep, completeOnboarding } from "@/app/(onboarding)/actions";
import { OnboardingProgress } from "@/app/(onboarding)/components/onboarding-progress";
import { StepEmpresa } from "@/app/(onboarding)/components/steps/step-empresa";
import { StepObjetivo } from "@/app/(onboarding)/components/steps/step-objetivo";
import { StepCanais } from "@/app/(onboarding)/components/steps/step-canais";
import { StepIA } from "@/app/(onboarding)/components/steps/step-ia";
import { StepMetas } from "@/app/(onboarding)/components/steps/step-metas";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";

interface OnboardingWizardProps {
  initialStep: number;
  initialData: Partial<OnboardingData>;
}

const STEP_TITLES = [
  "Sua Empresa",
  "Seu Objetivo",
  "Seus Canais",
  "Sua IA",
  "Suas Metas",
];

const STEP_COMPONENTS = [StepEmpresa, StepObjetivo, StepCanais, StepIA, StepMetas];

export function OnboardingWizard({ initialStep, initialData }: OnboardingWizardProps) {
  const router = useRouter();

  const [step, setStep] = useState(initialStep);
  const [data, setData] = useState<Partial<OnboardingData>>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [direction, setDirection] = useState(1);

  const isLastStep = step === ONBOARDING_TOTAL_STEPS - 1;
  const StepComponent = STEP_COMPONENTS[step];

  // Fire once on mount — initialStep may be > 0 on resume, still counts as start
  useEffect(() => {
    trackEvent("onboarding_start");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(patch: Partial<OnboardingData>) {
    setData((prev) => ({ ...prev, ...patch }));
  }

  function handleBack() {
    if (step === 0 || saving) return;
    setDirection(-1);
    setStep((s) => s - 1);
    setError(null);
  }

  async function handleNext() {
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
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg bg-white/[0.06] backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
        {/* Logo */}
        <div className="text-2xl font-bold text-white mb-8 text-center">Agendra</div>

        {/* Progress bar */}
        <div className="mb-6">
          <OnboardingProgress current={step + 1} total={ONBOARDING_TOTAL_STEPS} />
        </div>

        {/* Step header */}
        <h1 className="text-2xl font-semibold text-white mb-1">{STEP_TITLES[step]}</h1>
        <p className="text-white/50 text-sm mb-6">
          Passo {step + 1} de {ONBOARDING_TOTAL_STEPS}
        </p>

        {/* Step content with slide animation */}
        <div className="relative overflow-hidden min-h-[100px]">
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

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 gap-3">
          {step > 0 ? (
            <Button variant="ghost" size="md" onClick={handleBack} disabled={saving}>
              Voltar
            </Button>
          ) : (
            <div />
          )}

          <Button variant="primary" size="lg" onClick={handleNext} disabled={saving}>
            {saving ? "Aguarde..." : isLastStep ? "Concluir" : "Continuar"}
          </Button>
        </div>

        {/* Error display */}
        {error && (
          <p className="mt-4 text-red-400 text-sm text-center">{error}</p>
        )}
      </div>
    </div>
  );
}
