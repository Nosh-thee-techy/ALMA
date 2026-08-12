import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AlmaLogo } from "@/components/turkana/AlmaLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { roleLabels, useAuth, type OrgRole } from "@/lib/auth";

export const Route = createFileRoute("/signup")({
  component: SignUpPage,
});

function SignUpPage() {
  const { signUp, session } = useAuth();
  const navigate = useNavigate();
  const [orgName, setOrgName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("ngo");

  if (session) {
    void navigate({ to: "/home" });
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <AlmaLogo className="h-12 w-12 rounded-xl object-cover" />
          <div>
            <h1 className="text-xl font-bold">Create your ALMA workspace</h1>
            <p className="text-sm text-muted-foreground">For NGO and county response teams</p>
          </div>
        </div>

        <p className="mt-4 rounded-lg bg-dust px-3 py-2 text-sm text-foreground">
          Farmers do not sign up here. They use SMS/USSD (<strong>*384*96428#</strong>). This signup
          is for organizations that operate the early-action desk.
        </p>

        <div className="mt-3 rounded-lg border border-border bg-card px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <p className="font-bold text-foreground">Where does this info go?</p>
          <p className="mt-1">
            Right now: only into{" "}
            <strong className="text-foreground">this browser’s local storage</strong> (keys{" "}
            <code className="rounded bg-dust px-1">alma.session.v1</code> and{" "}
            <code className="rounded bg-dust px-1">alma.org-registry.v1</code>). It is{" "}
            <strong className="text-foreground">not</strong> sent to a server, email, or database
            yet.
          </p>
          <p className="mt-1">
            Production would store org accounts in a real auth backend (invite + SSO).
          </p>
        </div>

        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            signUp({ orgName, fullName, email, role });
            void navigate({ to: "/home" });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="org">Organization</Label>
            <Input
              id="org"
              required
              placeholder="e.g. Turkana County DRM / Red Cross Turkana"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              required
              placeholder="e.g. Amina Otieno"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Work email</Label>
            <Input
              id="email"
              type="email"
              required
              placeholder="you@organization.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">I work as</legend>
            {(Object.keys(roleLabels) as OrgRole[]).map((r) => (
              <label
                key={r}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-border px-3 py-2"
              >
                <input
                  type="radio"
                  name="role"
                  className="mt-1"
                  checked={role === r}
                  onChange={() => setRole(r)}
                />
                <span className="text-sm font-bold">{roleLabels[r]}</span>
              </label>
            ))}
          </fieldset>

          <Button
            type="submit"
            className="w-full bg-act font-bold text-act-foreground hover:bg-act/90"
          >
            Create workspace
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already registered?{" "}
          <Link to="/login" className="font-bold text-primary">
            Sign in
          </Link>
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Prototype auth is stored in this browser only. Production needs a real account service
          (org invite + SSO).
        </p>
      </div>
    </div>
  );
}
