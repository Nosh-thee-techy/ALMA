import { LogOut, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { farmerCopy, type FarmerLang } from "@/lib/farmer-locale";
import { cn } from "@/lib/utils";

type Asset = { kind: string; name: string; howTheyAre: string };
type Gap = {
  youAre?: string;
  youShouldBe?: string;
  howToGetBetter?: string[];
  done?: number;
  total?: number;
};
type Climate = {
  place?: string;
  summary?: string;
  prediction?: string;
  phasePlain?: string;
  climateState?: string;
};

export function FarmerAfterHome({
  lang,
  hazard,
  bannerClass,
  onRed,
  climate,
  gap,
  assets,
  smsTip,
  eligible,
  interestLogged,
  speaking,
  almaBusy,
  onSpeak,
  onOpenAlma,
  onRecovery,
  onSignOut,
}: {
  lang: FarmerLang;
  hazard: string;
  bannerClass: string;
  onRed: boolean;
  climate: Climate;
  gap: Gap;
  assets: Asset[];
  smsTip?: string;
  eligible: boolean;
  interestLogged: boolean;
  speaking: boolean;
  almaBusy: boolean;
  onSpeak: (topic: string) => void;
  onOpenAlma: () => void;
  onRecovery: () => void;
  onSignOut: () => void;
}) {
  const copy = farmerCopy(lang);
  const ink = onRed ? "text-risk-severe-foreground" : "text-foreground";
  const muted = onRed ? "opacity-90" : "text-foreground/80";

  return (
    <div className="space-y-6">
      <section className={cn("rounded-2xl border-2 p-4", bannerClass)}>
        <p className={cn("text-2xl font-bold leading-none", ink)}>Hazard {hazard}</p>
        <p className={cn("mt-2 text-sm font-medium leading-snug", muted)}>
          {climate.prediction || climate.summary || climate.phasePlain}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p className={cn("text-xs font-bold", muted)}>{copy.youAre}</p>
            <p className={cn("mt-1 text-sm font-bold leading-snug", ink)}>{gap.youAre}</p>
          </div>
          <div>
            <p className={cn("text-xs font-bold", muted)}>{copy.youShould}</p>
            <p className={cn("mt-1 text-sm font-bold leading-snug", ink)}>{gap.youShouldBe}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onSpeak("home")}
          disabled={almaBusy}
          className={cn(
            "mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-act font-bold text-act-foreground",
            "disabled:opacity-60",
          )}
        >
          {speaking ? (
            <span className="alma-bars" aria-hidden>
              <span /><span /><span /><span /><span />
            </span>
          ) : (
            <Mic className="h-5 w-5" aria-hidden />
          )}
          {speaking ? copy.almaListening : copy.talkAlma}
        </button>
      </section>

      <section>
        <h2 className="text-base font-bold">{copy.climateHere}</h2>
        <p className="mt-2 text-sm leading-relaxed">
          {climate.place}: {climate.phasePlain} {climate.summary}
        </p>
        <button
          type="button"
          className="mt-2 text-sm font-bold text-primary"
          onClick={() => onSpeak("climate")}
        >
          {copy.playVoice} — {copy.climateHere}
        </button>
      </section>

      <section>
        <h2 className="text-base font-bold">{copy.myCrops}</h2>
        {assets.length === 0 ? (
          <p className="mt-2 text-sm text-foreground/80">Register crops, animals, or fishing gear so Alma can speak to them by name.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {assets.map((asset) => (
              <li key={`${asset.kind}-${asset.name}`} className="py-3">
                <p className="text-sm font-bold capitalize">
                  {asset.kind === "crop" ? "Crop" : asset.kind === "animal" ? "Animal" : "Gear"} · {asset.name}
                </p>
                <p className="mt-1 text-sm leading-relaxed">{asset.howTheyAre}</p>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="mt-1 text-sm font-bold text-primary"
          onClick={() => onSpeak("assets")}
        >
          {copy.playVoice} — {copy.myCrops}
        </button>
      </section>

      {(gap.howToGetBetter || []).length > 0 && (
        <section>
          <h2 className="text-base font-bold">{copy.getBetter}</h2>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
            {gap.howToGetBetter!.map((tip) => (
              <li key={tip.slice(0, 48)}>{tip}</li>
            ))}
          </ol>
          <button
            type="button"
            className="mt-2 text-sm font-bold text-primary"
            onClick={() => onSpeak("gap")}
          >
            {copy.playVoice} — {copy.getBetter}
          </button>
        </section>
      )}

      {smsTip ? (
        <p className="rounded-xl bg-dust px-3 py-2 text-sm leading-relaxed">
          <span className="font-bold">SMS · </span>
          {smsTip}
        </p>
      ) : null}

      {eligible && (
        <div className="rounded-2xl bg-dust p-4">
          <p className="text-sm font-bold">Recovery follow-up</p>
          <p className="mt-1 text-sm leading-relaxed">
            Parametric flag — you were in the hazard zone with a pre-event log. Not a payment.
          </p>
          <Button
            type="button"
            className="mt-3 h-12 w-full bg-act font-bold text-act-foreground hover:bg-act/90"
            disabled={interestLogged}
            onClick={onRecovery}
          >
            {interestLogged ? "Interest logged" : "Log my interest"}
          </Button>
        </div>
      )}

      <Button type="button" variant="outline" className="h-12 w-full font-bold" onClick={onOpenAlma}>
        {copy.talkAlma}
      </Button>
      <button
        type="button"
        onClick={onSignOut}
        className="inline-flex items-center gap-1 text-sm font-bold text-primary"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );
}
