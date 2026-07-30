import { useAuth } from "@/lib/auth";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

/** Wrap operator pages — guests go to the public landing, not into the desk. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, ready } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !session) {
      void navigate({ to: "/" });
    }
  }, [ready, session, navigate]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!session) return null;
  return <>{children}</>;
}
