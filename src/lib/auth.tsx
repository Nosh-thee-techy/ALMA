import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type OrgRole = "ngo" | "county" | "analyst";

export interface AlmaSession {
  orgName: string;
  email: string;
  fullName: string;
  role: OrgRole;
  signedInAt: string;
}

const STORAGE_KEY = "alma.session.v1";
const REGISTRY_KEY = "alma.org-registry.v1";

export type RegisteredOrg = AlmaSession;

function readRegistry(): RegisteredOrg[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RegisteredOrg[];
  } catch {
    return [];
  }
}

function writeRegistry(rows: RegisteredOrg[]) {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(rows));
}

type AuthContextValue = {
  session: AlmaSession | null;
  ready: boolean;
  signUp: (input: Omit<AlmaSession, "signedInAt">) => void;
  signIn: (email: string, orgName: string) => boolean;
  signOut: () => void;
  /** Prototype only — orgs registered in this browser. */
  listRegisteredOrgs: () => RegisteredOrg[];
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readSession(): AlmaSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AlmaSession;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AlmaSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(readSession());
    setReady(true);
  }, []);

  const persist = (next: AlmaSession | null) => {
    setSession(next);
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  };

  const signUp: AuthContextValue["signUp"] = (input) => {
    const next = { ...input, signedInAt: new Date().toISOString() };
    persist(next);
    // Keep a local registry so signup is inspectable in this browser (no server yet).
    const registry = readRegistry().filter((r) => r.email.toLowerCase() !== next.email.toLowerCase());
    writeRegistry([next, ...registry]);
  };

  const signIn: AuthContextValue["signIn"] = (email, orgName) => {
    const registry = readRegistry();
    const fromRegistry = registry.find((r) => r.email.toLowerCase() === email.toLowerCase());
    if (fromRegistry) {
      persist({
        ...fromRegistry,
        orgName: orgName || fromRegistry.orgName,
        signedInAt: new Date().toISOString(),
      });
      return true;
    }
    const existing = readSession();
    if (existing && existing.email.toLowerCase() === email.toLowerCase()) {
      persist({ ...existing, orgName: orgName || existing.orgName, signedInAt: new Date().toISOString() });
      return true;
    }
    if (email && orgName) {
      const light = {
        email,
        orgName,
        fullName: email.split("@")[0] ?? "Officer",
        role: "ngo" as const,
        signedInAt: new Date().toISOString(),
      };
      persist(light);
      return true;
    }
    return false;
  };

  const signOut = () => persist(null);
  const listRegisteredOrgs = () => readRegistry();

  return (
    <AuthContext.Provider value={{ session, ready, signUp, signIn, signOut, listRegisteredOrgs }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export const roleLabels: Record<OrgRole, string> = {
  ngo: "NGO emergency team",
  county: "County disaster office",
  analyst: "Regional analyst (ICPAC/CEWARN)",
};
