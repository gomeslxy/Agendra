"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { OnboardingData } from "@/lib/onboarding/types";
import { ONBOARDING_TOTAL_STEPS } from "@/lib/onboarding/types";
import { saveOnboardingStep, completeOnboarding } from "@/app/(onboarding)/actions";
import { OnboardingProgress } from "@/app/(onboarding)/components/onboarding-progress";
import { Button } from "@/components/ui/button";

interface OnboardingWizardProps {
  initialStep: number;
  initialData: Partial<OnboardingData>;
  companyId: string;
}

const STEP_TITLES = [
  "Sua Empresa",
  "Seu Objetivo",
  "Seus Canais",
  "Sua IA",
  "Suas Metas",
];

function StepPlaceholder({
  step,
  data,
  onChange,
}: {
  step: number;
  data: Partial<OnboardingData>;
  onChange: (d: Partial<OnboardingData>) => void;
}) {
  return (
    <div className="text-white/60 text-sm py-4">
      Step {step + 1} content (coming soon)
    </div>
  );
}

export function OnboardingWizard({
  initialStep,
  initialData,
}: OnboardingWizardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState(initialStep);
  const [data, setData] = useState<Partial<OnboardingData>>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [direction, setDirection] = useState(1);

  const isLastStep = step === ONBOARDING_TOTAL_STEPS - 1;

  function handleChange(patch: Partial<OnboardingData>) {
    setData((prev) => ({ ...prev, ...patch }));
  }

  function handleBack() {
    if (step === 0) return;
    setDirection(-1);
    setStep((s) => s - 1);
    setError(null);
  }

  function handleNext() {
    setError(null);

    if (isLastStep) {
      setCompleting(true);
      startTransition(async () => {
        try {
          const result = await completeOnboarding(data as OnboardingData);
          if (result.ok) {
            router.push("/inbox");
            router.refresh();
          } else {
            setError(result.error ?? "Ocorreu um erro ao concluir o onboarding.");
          }
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Erro inesperado ao concluir."
          );
        } finally {
          setCompleting(false);
        }
      });
    } else {
      setDirection(1);
      startTransition(async () => {
        try {
          await saveOnboardingStep(step + 1, data);
          setStep((s) => s + 1);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Erro ao salvar o progresso."
          );
        }
      });
    }
  }

  const saving = isPending || completing;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg bg-white/[0.06] backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
        {/* Logo */}
        <div className="text-2xl font-bold text-white mb-8 text-center">
          Agendra
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <OnboardingProgress current={step + 1} total={ONBOARDING_TOTAL_STEPS} />
        </div>

        {/* Step header */}
        <h1 className="text-2xl font-semibold text-white mb-1">
          {STEP_TITLES[step]}
        </h1>
        <p className="text-white/50 text-sm mb-6">
          Passo {step + 1} de 5
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
              <StepPlaceholder step={step} data={data} onChange={handleChange} />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 gap-3">
          {step > 0 ? (
            <Button
              variant="ghost"
              size="md"
              onClick={handleBack}
              disabled={saving}
            >
              Voltar
            </Button>
          ) : (
            <div />
          )}

          <Button
            variant="primary"
            size="lg"
            onClick={handleNext}
            disabled={saving}
          >
            {saving
              ? "Aguarde..."
              : isLastStep
              ? "Concluir"
              : "Continuar"}
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
