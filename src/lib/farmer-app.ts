/** Farmer After app — separate host from the operator desk. */

const SUBDOMAIN = "after";

export function isFarmerAppHost(host?: string): boolean {
  const raw = (host ?? (typeof window !== "undefined" ? window.location.host : "")).trim();
  const hostname = raw.split(":")[0]?.toLowerCase() || "";
  if (!hostname) return false;
  if (hostname === `${SUBDOMAIN}.localhost`) return true;
  if (hostname.startsWith(`${SUBDOMAIN}.`)) return true;
  if (hostname.startsWith("readiness.")) return true;
  const env = farmerOriginFromEnv();
  if (env) {
    try {
      return new URL(env).hostname.toLowerCase() === hostname;
    } catch {
      return false;
    }
  }
  return false;
}

function farmerOriginFromEnv(): string | undefined {
  const env = (import.meta.env.VITE_FARMER_APP_ORIGIN as string | undefined)?.trim();
  return env ? env.replace(/\/$/, "") : undefined;
}

/** Absolute URL for the farmer After app (subdomain). */
export function farmerAppHref(path = "/"): string {
  const suffix = path === "/" ? "/" : path;
  const env = farmerOriginFromEnv();
  if (typeof window === "undefined") {
    return `${env || `http://${SUBDOMAIN}.localhost:8080`}${suffix === "/" ? "" : suffix}`;
  }
  if (isFarmerAppHost(window.location.host)) {
    return `${window.location.origin}${suffix === "/" ? "" : suffix}`;
  }
  if (env) return `${env}${suffix === "/" ? "" : suffix}`;
  const port = window.location.port ? `:${window.location.port}` : "";
  return `${window.location.protocol}//${SUBDOMAIN}.localhost${port}${suffix === "/" ? "" : suffix}`;
}
