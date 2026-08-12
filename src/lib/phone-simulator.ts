/**
 * Feature-phone simulator client — USSD, SMS, and voice IVR against the ALMA engine.
 */
import { engineBaseUrl } from "@/lib/alma-engine";

export type UssdSimResult = {
  ok: boolean;
  session_id: string;
  raw: string;
  text: string;
  continue: boolean;
  session_end: boolean;
};

export type VoiceSimParsed = {
  text: string;
  needs_digit: boolean;
  needs_record: boolean;
  record_max_seconds?: number | null;
  end_call: boolean;
  dial_number?: string | null;
  segments?: Array<{ type: string; text?: string; url?: string }>;
  simulated_text_qa?: boolean;
  qa_meta?: { question?: string; answer?: string; reason?: string };
};

export type VoiceSimResult = {
  ok: boolean;
  session_id: string;
  ward: string;
  parsed: VoiceSimParsed;
  conversation?: {
    turn_count?: number;
    state?: string;
  } | null;
};

export type SmsPreview = {
  ok: boolean;
  tier: string;
  compound_active: boolean;
  message: string;
  plain_summary?: string;
  lang: string;
};

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${engineBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`${path} → ${res.status}${err ? `: ${err.slice(0, 120)}` : ""}`);
  }
  return res.json() as Promise<T>;
}

export function simUssd(params: {
  sessionId?: string;
  phone: string;
  text: string;
  reset?: boolean;
}) {
  return postJson<UssdSimResult>("/api/simulator/phone/ussd", {
    session_id: params.sessionId,
    phone: params.phone,
    text: params.text,
    reset: params.reset ?? false,
  });
}

export function simVoice(params: {
  sessionId?: string;
  phone: string;
  ward?: string;
  digit?: string;
  questionText?: string;
  lang?: string;
  reset?: boolean;
}) {
  return postJson<VoiceSimResult>("/api/simulator/phone/voice", {
    session_id: params.sessionId,
    phone: params.phone,
    ward: params.ward ?? "kalokol",
    digit: params.digit ?? "",
    question_text: params.questionText ?? "",
    lang: params.lang ?? "sw",
    reset: params.reset ?? false,
  });
}

export function simVoiceQa(params: {
  sessionId?: string;
  phone: string;
  ward?: string;
  question: string;
  lang?: string;
  reset?: boolean;
}) {
  return postJson<{
    ok: boolean;
    session_id: string;
    speak?: string;
    answer?: string;
    end_call?: boolean;
    await_digit?: boolean;
    reason?: string;
    note?: string;
  }>("/api/simulator/phone/voice-qa", {
    session_id: params.sessionId,
    phone: params.phone,
    ward: params.ward ?? "kalokol",
    question: params.question,
    lang: params.lang ?? "sw",
    reset: params.reset ?? false,
  });
}

export function previewSms(params?: { lang?: "en" | "sw"; sector?: string; region_id?: string }) {
  return postJson<SmsPreview>("/api/simulator/phone/sms-preview", {
    lang: params?.lang ?? "en",
    sector: params?.sector ?? "pastoralist",
    region_id: params?.region_id ?? "turkana",
  });
}

export function sendSimSms(params: {
  phone: string;
  lang?: "en" | "sw";
  sector?: string;
  region_id?: string;
}) {
  return postJson<{ ok: boolean; preview: SmsPreview; sms: { mode?: string; ok?: boolean } }>(
    "/api/simulator/phone/sms-send",
    {
      phone: params.phone,
      lang: params.lang ?? "en",
      sector: params.sector ?? "pastoralist",
      region_id: params.region_id ?? "turkana",
    },
  );
}
