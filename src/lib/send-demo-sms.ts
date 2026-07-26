// Server-side SMS dispatch for the Simulator demo.
// Keeps Africa's Talking credentials off the client; falls back to demo mode
// when AT_API_KEY / AT_USERNAME are not configured yet.
import { createServerFn } from "@tanstack/react-start";

export type SendDemoSmsResult =
  | { mode: "demo" }
  | { mode: "live"; status: number };

export const sendDemoSms = createServerFn({ method: "POST" })
  .inputValidator((data: { phone: string; message: string }) => data)
  .handler(async ({ data }): Promise<SendDemoSmsResult> => {
    const apiKey = process.env.AT_API_KEY;
    const username = process.env.AT_USERNAME;

    // No credentials yet — UI still completes the flow in demo mode.
    if (!apiKey || !username) {
      return { mode: "demo" };
    }

    // REAL API CALL — Africa's Talking SMS sandbox
    // Docs: https://developers.africastalking.com/docs/sms/sending
    // POST https://api.sandbox.africastalking.com/version1/messaging
    const body = new URLSearchParams({
      username,
      to: data.phone,
      message: data.message,
    });

    const res = await fetch("https://api.sandbox.africastalking.com/version1/messaging", {
      method: "POST",
      headers: {
        apiKey,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Africa's Talking SMS failed (${res.status}): ${text}`);
    }

    return { mode: "live", status: res.status };
  });
