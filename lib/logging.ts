export const isDebug = process.env.DEBUG_WHATSAPP === 'true';

export function logDebug(message: string, ...optionalParams: any[]) {
  if (isDebug) {
    console.debug(`[DEBUG] ${message}`, ...optionalParams);
  }
}

export function logInfo(message: string, ...optionalParams: any[]) {
  console.info(`[INFO] ${message}`, ...optionalParams);
}

export function logError(message: string, ...optionalParams: any[]) {
  console.error(`[ERROR] ${message}`, ...optionalParams);
}
