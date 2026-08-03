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
};

export function useLiveBasin(pollMs = 45000) {
  const [data, setData] = useState<LiveBasin>(FALLBACK);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const next = await fetchLiveBasin();
        if (!cancelled) {
          setData(next);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Engine unreachable");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const id = window.setInterval(load, pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pollMs]);

  return {
    data,
    loading,
    error,
    isLive: data.source === "live" && !error,
  };
}
