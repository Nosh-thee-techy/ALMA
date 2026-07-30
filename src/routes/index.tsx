// Public landing — signup/login entry. Operators only; farmers use USSD.
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlmaLogo } from "@/components/turkana/AlmaLogo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ALMA — Early Action for Omo–Turkana" },
      {
        name: "description",
        content:
          "ALMA helps NGO and county teams see Gibe III dam status, upstream rain, and clear next actions for flood early warning.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { session } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <div className="flex items-center gap-3">
          <AlmaLogo className="h-11 w-11 rounded-xl object-cover shadow-sm" />
          <div>
            <p className="text-lg font-bold leading-none">ALMA</p>
            <p className="mt-1 text-xs text-muted-foreground">Automated Land & Moisture Action</p>
          </div>
        </div>
        <div className="flex gap-2">
          {session ? (
            <Button asChild className="bg-act font-bold text-act-foreground hover:bg-act/90">
              <Link to="/home">Open desk</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="outline" className="font-bold">
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild className="bg-act font-bold text-act-foreground hover:bg-act/90">
                <Link to="/signup">Create workspace</Link>
              </Button>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6 sm:pt-14">
        <p className="text-sm font-bold text-primary">For NGO & county response teams</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          See the dam. See the rain. Know what to do next.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          ALMA is the Early Action desk for the Omo–Turkana basin. It turns Gibe III status and
          upstream rainfall into a simple green / yellow / red picture — then sector playbooks and
          SMS warnings.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="bg-act font-bold text-act-foreground hover:bg-act/90">
            <Link to="/signup">Create your org workspace</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="font-bold">
            <Link to="/login">I already have an account</Link>
          </Button>
        </div>

        <ul className="mt-12 grid gap-4 sm:grid-cols-3">
          <li className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">1</p>
            <h2 className="mt-2 font-bold">Dam status</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Current Gibe III fill, release, and spillway — metrics first, not noise.
            </p>
          </li>
          <li className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">2</p>
            <h2 className="mt-2 font-bold">Rain status</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Upstream catchment rain and soil saturation in plain language.
            </p>
          </li>
          <li className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">3</p>
            <h2 className="mt-2 font-bold">Act when red</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              When both rise together, ALMA shows Compound Risk and the next actions first.
            </p>
          </li>
        </ul>

        <div className="mt-10 rounded-2xl bg-dust px-5 py-4 text-sm">
          <p className="font-bold">Farmers and fishers do not use this website.</p>
          <p className="mt-1 text-muted-foreground">
            Last-mile guidance is on feature phones via USSD <strong className="text-foreground">*384*96428#</strong>{" "}
            and SMS. This site is the operator desk only.
          </p>
        </div>
      </main>
    </div>
  );
}
