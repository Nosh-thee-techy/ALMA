import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AlmaLogo } from "@/components/turkana/AlmaLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { signIn, session } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState("");

  if (session) {
    void navigate({ to: "/home" });
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <AlmaLogo className="h-12 w-12 rounded-xl object-cover" />
          <div>
            <h1 className="text-xl font-bold">Sign in to ALMA</h1>
            <p className="text-sm text-muted-foreground">Operator desk for Omo–Turkana</p>
          </div>
        </div>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const ok = signIn(email, orgName);
            if (!ok) {
              setError("Use the email and organization from signup.");
              return;
            }
            void navigate({ to: "/home" });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Work email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org">Organization</Label>
            <Input id="org" required value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          </div>
          {error && <p className="text-sm font-bold text-risk-severe">{error}</p>}
          <Button
            type="submit"
            className="w-full bg-act font-bold text-act-foreground hover:bg-act/90"
          >
            Sign in
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          New organization?{" "}
          <Link to="/signup" className="font-bold text-primary">
            Create a workspace
          </Link>
        </p>
      </div>
    </div>
  );
}
