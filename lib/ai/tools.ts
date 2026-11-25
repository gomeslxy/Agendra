/**
 * Fachada de compatibilidade para ferramentas da IA.
 * A definição única de schemas e executor validado reside em `./tools/registry.ts`.
 */
import type { Tool } from '@google/generative-ai';
import { toGeminiFunctionDeclarations } from './tools/registry';
import { handleBookAppointment } from './tools/scheduling-tools';

export type { ToolContext, BookingResult } from './tools/types';
export {
  handleListServices,
  handleGetAvailableSlots,
  handleBookAppointment,
  handleCancelAppointment,
  handleRescheduleAppointment,
  handleMyAppointments,
} from './tools/scheduling-tools';
export {
  handleUpdateLeadInfo,
  handleUpdateLeadMemory,
  handleRequestHumanAgent,
} from './tools/crm-tools';
export { handleGeneratePixCharge, handleCheckPaymentStatus } from './tools/payment-tools';

export function getToolDeclarations(): Tool {
  return { functionDeclarations: toGeminiFunctionDeclarations() };
}

export const handleBookMeeting = handleBookAppointment;
