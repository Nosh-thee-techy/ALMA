/** USSD short code — keep in sync with USSD_DIAL_CODE / VITE_USSD_DIAL_CODE in .env */
export const ussdDialCode =
  (import.meta.env.VITE_USSD_DIAL_CODE as string | undefined)?.trim() || "*384*51567#";
