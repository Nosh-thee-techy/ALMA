/** Africa's Talking SMS shortcode — keep in sync with AT_SMS_SHORTCODE / USSD_CHANNEL */
export const smsShortcode =
  (import.meta.env.VITE_AT_SMS_SHORTCODE as string | undefined)?.trim() ||
  (import.meta.env.VITE_USSD_CHANNEL as string | undefined)?.trim() ||
  "51567";
