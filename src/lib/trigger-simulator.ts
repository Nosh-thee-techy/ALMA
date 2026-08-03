// Proxy pitch-demo dispatch to the ALMA Python engine when it is running.
// Falls back to the TanStack SMS helper if the engine is unreachable.
import { createServerFn } from "@tanstack/react-start";
import { sendDemoSms } from "@/lib/send-demo-sms";

export type SimulatorTriggerResult = {
  ok: boolean;
  source: "engine" | "fallback_sms";
  mode?: "demo" | "live" | "error";
  tier?: string;
  severity?: number;
  message: string;
  compound_active?: boolean;
  plain_summary?: string;
  note?: string;
  channel?: string;
};

const engineBase = () =>
  (
    (typeof import.meta !== "undefined" &&
      (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_ALMA_ENGINE_URL) ||
    (typeof import.meta !== "undefined" &&
      (import.meta as ImportMeta & { env?: Record<string, string> }).env?.ALMA_ENGINE_URL) ||
    process.env.ALMA_ENGINE_URL ||
    process.env.VITE_ALMA_ENGINE_URL ||
    "http://127.0.0.1:8787"
  ).replace(/\/$/, "");

/** Map 0–100 dam slider (% fill delta) → approximate discharge m³/s for the risk engine. */
export function damSliderToM3s(slider: number): number {
  return Math.round(slider * 25);
}

export const triggerSimulator = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      rain_mm: number;
      dam_discharge_m3s: number;
      target_phone_number: string;
      sector?: string;
      lang?: string;
      channel?: "sms" | "whatsapp" | "both";
    }) => data,
  )
  .handler(async ({ data }): Promise<SimulatorTriggerResult> => {
    const channel = data.channel ?? "whatsapp";
    try {
      const res = await fetch(`${engineBase()}/api/simulator/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          rain_mm: data.rain_mm,
          dam_discharge_m3s: data.dam_discharge_m3s,
          target_phone_number: data.target_phone_number,
          sector: data.sector ?? "pastoralist",
          lang: data.lang ?? "en",
          data_quality: "simulated",
          channel,
        }),
      });
      if (!res.ok) {
        throw new Error(`Engine HTTP ${res.status}`);
      }
      const json = (await res.json()) as {
        message?: string;
        mode?: string;
        risk?: {
          tier?: string;
          compound_severity?: number;
          compound_active?: boolean;
          plain_summary?: string;
        };
        sms?: { mode?: string };
        whatsapp?: { mode?: string };
        telemetry_note?: string;
        channel?: string;
      };
      return {
        ok: true,
        source: "engine",
        mode: (json.mode as SimulatorTriggerResult["mode"]) || "demo",
        tier: json.risk?.tier,
        severity: json.risk?.compound_severity,
        message: json.message || "",
        compound_active: json.risk?.compound_active,
        plain_summary: json.risk?.plain_summary,
        note: json.telemetry_note,
        channel: json.channel || channel,
      };
    } catch {
      const fallbackMessage =
        `ALMA demo alert: rain ${data.rain_mm}mm, dam ~${data.dam_discharge_m3s} m3/s (simulated). Dial *384*96428#.`;
      if (channel === "whatsapp") {
        return {
          ok: true,
          source: "fallback_sms",
          mode: "demo",
          message: fallbackMessage,
          note: "Engine offline — WhatsApp demo only (no AT WhatsApp from web fallback).",
          channel,
        };
      }
      const sms = await sendDemoSms({
        data: { phone: data.target_phone_number, message: fallbackMessage },
      });
      return {
        ok: true,
        source: "fallback_sms",
        mode: sms.mode,
        message: fallbackMessage,
        note: "ALMA engine unreachable — used TanStack SMS fallback.",
        channel,
      };
    }
  });
