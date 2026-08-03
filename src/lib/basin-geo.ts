/**
 * Basin ward geography for the 3D weather heatmap (from engine wards_geojson).
 */
import type { RiskTier } from "@/lib/turkana-data";

export type BasinWard = {
  wardId: string;
  name: string;
  country: string;
  sector: string;
  corridor: string;
  forageDays: number;
  lon: number;
  lat: number;
  /** 0–1 position on schematic basin plane */
  u: number;
  v: number;
};

/** Lon/lat → schematic UV for the Omo–Turkana desk plane. */
function toUV(lon: number, lat: number): { u: number; v: number } {
  const u = (lon - 35.55) / 0.65;
  const v = 1 - (lat - 3.25) / 1.7;
  return {
    u: Math.min(0.92, Math.max(0.08, u)),
    v: Math.min(0.9, Math.max(0.1, v)),
  };
}

const RAW: Omit<BasinWard, "u" | "v">[] = [
  {
    wardId: "omorate",
    name: "Omorate",
    country: "Ethiopia",
    sector: "farmer",
    corridor: "Elevated terrace · 3km SOUTH",
    forageDays: 5,
    lon: 36.05,
    lat: 4.8,
  },
  {
    wardId: "todonyang",
    name: "Todonyang",
    country: "Kenya",
    sector: "pastoralist",
    corridor: "High-Ground Corridor C · 5km WEST",
    forageDays: 7,
    lon: 35.95,
    lat: 4.45,
  },
  {
    wardId: "nachukui",
    name: "Nachukui",
    country: "Kenya",
    sector: "pastoralist",
    corridor: "Ridge trail · 7km EAST",
    forageDays: 9,
    lon: 35.85,
    lat: 3.95,
  },
  {
    wardId: "kalokol",
    name: "Kalokol",
    country: "Kenya",
    sector: "fisher",
    corridor: "High-Ground Corridor B · 8km EAST",
    forageDays: 8,
    lon: 35.75,
    lat: 3.52,
  },
  {
    wardId: "kangatotha",
    name: "Kangatotha",
    country: "Kenya",
    sector: "pastoralist",
    corridor: "High-Ground Corridor A · 6km NORTH",
    forageDays: 10,
    lon: 35.68,
    lat: 3.41,
  },
];

export const basinWards: BasinWard[] = RAW.map((w) => ({ ...w, ...toUV(w.lon, w.lat) }));

export type AreaWeather = {
  wardId: string;
  name: string;
  rain24hMm: number;
  rain7dMm: number;
  rainDeltaMm: number;
  releaseM3s: number;
  tier: RiskTier;
  rainEtaH: number;
  damEtaH: number;
  plain: string;
  daily: { day: string; mm: number }[];
};

/** Localize basin-wide rain into per-ward intensity (downstream decays slightly). */
export function weatherForWard(
  ward: BasinWard,
  opts: {
    rain24hMm: number;
    rain7dMm: number;
    releaseM3s: number;
    tier: RiskTier;
    rainEtaH: number;
    damEtaH: number;
    dailyMm?: number[];
    dates?: string[];
  },
): AreaWeather {
  // Upstream Ethiopia wards see hotter rain signal; lake-edge wards cooler.
  const upstreamBoost = ward.lat > 4.2 ? 1.15 : ward.lat > 3.7 ? 1.0 : 0.82;
  const rain24 = Math.round(opts.rain24hMm * upstreamBoost * 10) / 10;
  const rain7 = Math.round(opts.rain7dMm * upstreamBoost * 10) / 10;
  const daily = (opts.dailyMm || []).map((mm, i) => {
    const raw = opts.dates?.[i] || `D${i + 1}`;
    const day = raw.length > 7 && raw.includes("-") ? raw.slice(5) : raw;
    return {
      day,
      mm: Math.round(mm * upstreamBoost * 10) / 10,
    };
  });
  const prev = daily.length >= 2 ? daily[daily.length - 2].mm : rain24;
  const rainDelta = Math.round((rain24 - prev) * 10) / 10;
  const etaRain = Math.max(4, Math.round(opts.rainEtaH + (4.8 - ward.lat) * 8));
  const etaDam = Math.max(8, Math.round(opts.damEtaH + (4.8 - ward.lat) * 6));

  const plain =
    rainDelta > 2
      ? `Rain is rising at ${ward.name} (+${rainDelta} mm vs yesterday). Move livestock toward ${ward.corridor}.`
      : rainDelta < -2
        ? `Rain easing at ${ward.name} (${rainDelta} mm vs yesterday). Keep watching dam release.`
        : `Rain steady at ${ward.name}. Flood level ${opts.tier}. Corridor: ${ward.corridor}.`;

  return {
    wardId: ward.wardId,
    name: ward.name,
    rain24hMm: rain24,
    rain7dMm: rain7,
    rainDeltaMm: rainDelta,
    releaseM3s: opts.releaseM3s,
    tier: opts.tier,
    rainEtaH: etaRain,
    damEtaH: etaDam,
    plain,
    daily,
  };
}
