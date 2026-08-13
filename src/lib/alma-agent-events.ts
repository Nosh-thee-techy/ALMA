/** Tiny event bus for Alma dock — keep this free of the heavy UI module. */

const OPEN_EVENT = "alma:open";
const EXPLAIN_EVENT = "alma:explain";

export function openAlmaAgent(detail?: {
  prompt?: string;
  mode?: "desk" | "explain" | "readiness";
}) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail }));
}

export function askAlmaExplain(lang: "en" | "sw" = "en") {
  window.dispatchEvent(new CustomEvent(EXPLAIN_EVENT, { detail: { lang } }));
}

export const ALMA_OPEN_EVENT = OPEN_EVENT;
export const ALMA_EXPLAIN_EVENT = EXPLAIN_EVENT;
