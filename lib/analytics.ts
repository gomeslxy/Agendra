import { sendGAEvent } from "@next/third-parties/google";

export const GA_TRACKING_ID = "G-7DZDRQH0DB";

export type AnalyticsEvent = 
  | "login"
  | "signup"
  | "event_created"
  | "event_updated"
  | "event_deleted"
  | "gcal_connected"
  | "gcal_failed"
  | "cta_click"
  | "modal_opened"
  | "onboarding_start"
  | "onboarding_complete"
  | "nav_click"
  | "critical_error"
  | "integration_failed"
  | "lead_takeover"
  | "lead_automatize"
  | "tone_changed"
  | "message_sent"
  | "checkout_started"
  | "stripe_success";

export interface AnalyticsEventParams {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Função centralizada para disparo de eventos no Google Analytics 4.
 * Garante tipagem correta dos eventos e evita disparos acidentais no lado do servidor.
 */
export const trackEvent = (event: AnalyticsEvent, params?: AnalyticsEventParams) => {
  if (typeof window === "undefined") {
    // Evita execução no SSR
    return;
  }

  // Em desenvolvimento, logamos no console para ajudar no debug (DebugView local)
  if (process.env.NODE_ENV !== "production") {
    console.log(`[Analytics Debug] Event: ${event}`, params);
  }

  try {
    sendGAEvent({ event, ...params });
  } catch (error) {
    console.error("[Analytics Error] Failed to send event:", error);
  }
};
