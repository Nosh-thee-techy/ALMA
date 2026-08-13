import { useEffect, useState } from "react";
import { fetchLiveBasin, type LiveBasin } from "@/lib/alma-engine";
import {
  alerts as mockAlerts,
  communities as mockCommunities,
  compoundTrigger as mockCompound,
  damTrigger as mockDamTrigger,
  gibeIIIMetrics,
  rainfallTrigger as mockRainTrigger,
  trend as mockTrend,
  upstreamRainMetrics,
} from "@/lib/turkana-data";

const FALLBACK: LiveBasin = {
  source: "fallback",
  fetchedAt: "",
  rain: upstreamRainMetrics,
  dam: gibeIIIMetrics,
  rainfallTrigger: mockRainTrigger,
  damTrigger: mockDamTrigger,
  compoundTrigger: mockCompound,
  trend: mockTrend,
  communities: mockCommunities,
  alerts: mockAlerts,
  risk: null,
  pitchLine: "Engine offline — showing last mock snapshot.",
  glofasForecast: null,
  trainedRisk: null,
  riskOutlook: null,
  farmerEarlyHeadsUp: null,
  catchments: null,
  damPrediction: null,
  climaticState: null,
  climaticImpact: null,
  groundObservers: null,
  icpacOutlook: null,
};

/** Shared across routes so navigating Home → Dam → Rain does not cold-fetch again. */
let shared: LiveBasin = FALLBACK;
let sharedError: string | null = null;
let sharedLoading = true;
let lastOkAt = 0;
let inflight: Promise<void> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let subscribers = 0;
const listeners = new Set<() => void>();

const MIN_REFETCH_MS = 12_000;

function notify() {
  listeners.forEach((fn) => fn());
}

async function refresh(force = false) {
  const now = Date.now();
  if (!force && lastOkAt && now - lastOkAt < MIN_REFETCH_MS && shared.source === "live") {
    sharedLoading = false;
    notify();
    return;
  }
  if (inflight) return inflight;

  // Paint mock/last snapshot immediately — do not block the desk on Open-Meteo.
  sharedLoading = false;
  notify();

  inflight = (async () => {
    try {
      const next = await fetchLiveBasin();
      shared = next;
      sharedError = null;
      lastOkAt = Date.now();
    } catch (e) {
      sharedError = e instanceof Error ? e.message : "Engine unreachable";
      // Keep last good snapshot if we had one
      if (shared.source !== "live") {
        shared = { ...FALLBACK, fetchedAt: new Date().toISOString() };
      }
    } finally {
      sharedLoading = false;
      inflight = null;
      notify();
    }
  })();

  return inflight;
}

function ensurePolling(pollMs: number) {
  if (pollTimer != null) return;
  void refresh(false);
  pollTimer = setInterval(() => {
    void refresh(false);
  }, pollMs);
}

function stopPollingIfIdle() {
  if (subscribers > 0 || pollTimer == null) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

export function useLiveBasin(pollMs = 45000) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const onChange = () => setTick((n) => n + 1);
    listeners.add(onChange);
    subscribers += 1;
    ensurePolling(pollMs);
    // If another page already loaded data, paint immediately without waiting
    if (shared.source === "live" || !sharedLoading) {
      sharedLoading = false;
      notify();
    }
    return () => {
      listeners.delete(onChange);
      subscribers -= 1;
      stopPollingIfIdle();
    };
  }, [pollMs]);

  return {
    data: shared,
    loading: sharedLoading && shared.source !== "live",
    error: sharedError,
    isLive: shared.source === "live" && !sharedError,
    refresh: () => refresh(true),
  };
}
