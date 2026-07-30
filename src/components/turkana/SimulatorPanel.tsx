// SimulatorPanel: live compound risk demo. Two sliders drive the risk
// calculation and produce a sample alert in three languages.
import { useMemo, useState } from "react";
import { CloudRain, Dam, ShieldAlert, Play, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { damSliderToM3s, triggerSimulator } from "@/lib/trigger-simulator";
import { computeCompound, tierFromMetric, tierMeta, type RiskTier } from "@/lib/turkana-data";
import { cn } from "@/lib/utils";

function messageFor(tier: RiskTier, lang: "en" | "sw" | "local") {
  const en: Record<RiskTier, string> = {
    safe: "All clear. River levels normal. No action needed.",
    watch: "Rising water conditions. Monitor river levels and stay alert.",
    warning: "Flood likely within 12–24 hours. Move livestock and valuables to higher ground.",
    severe: "SEVERE FLOOD ALERT — evacuate low-lying areas immediately. Head to designated high ground.",
  };
  const sw: Record<RiskTier, string> = {
    safe: "Hakuna hatari. Kiwango cha maji ni cha kawaida.",
    watch: "Maji yanaongezeka. Endelea kuangalia mto na uwe tayari.",
    warning: "Mafuriko yanatarajiwa ndani ya masaa 12–24. Hamishia mifugo na vitu vya thamani mahali pa juu.",
    severe: "TAHADHARI KALI YA MAFURIKO — ondokeni katika maeneo ya chini mara moja. Nendeni mahali pa juu.",
  };
  const local: Record<RiskTier, string> = {
    safe: "[Ng'aturkana translation placeholder — safe]",
    watch: "[Ng'aturkana translation placeholder — watch]",
    warning: "[Ng'aturkana translation placeholder — warning]",
    severe: "[Ng'aturkana translation placeholder — severe]",
  };
  return { en, sw, local }[lang][tier];
}

export function SimulatorPanel() {
  const [rain, setRain] = useState(45);
  const [dam, setDam] = useState(30);
  const [ran, setRan] = useState(false);
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [channel, setChannel] = useState<"sms" | "whatsapp" | "both">("sms");

  const rainTier = tierFromMetric(rain);
  const damTier = tierFromMetric(dam);
  const compound = useMemo(() => computeCompound(rainTier, damTier), [rainTier, damTier]);

  // Pitch dispatch → ALMA engine /api/simulator/trigger (risk + SMS).
  // Falls back to TanStack SMS helper if the Python engine is offline.
  async function sendDemoSms() {
    if (!phone.trim()) {
      toast.error("Enter a phone number first (e.g. +2547XXXXXXXX).");
      return;
    }
    setSending(true);
    try {
      const result = await triggerSimulator({
        data: {
          rain_mm: rain,
          dam_discharge_m3s: damSliderToM3s(dam),
          target_phone_number: phone.trim(),
          sector: "pastoralist",
          lang: "en",
          channel,
        },
      });
      const sev = typeof result.severity === "number" ? result.severity.toFixed(0) : "—";
      const via =
        result.source === "engine"
          ? `ALMA engine (${result.tier ?? compound}, ${sev}/100)`
          : "SMS fallback (engine offline)";
      if (result.mode === "demo" || result.mode === "error") {
        toast.success("Demo mode: message simulated", {
          description: `${via} via ${channel}: "${result.message}"`,
        });
      } else {
        toast.success("Demo message sent", {
          description: `Delivered via ${via} (${channel}).`,
        });
      }
    } catch (err) {
      toast.error("Dispatch failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Controls */}
      <div className="space-y-6 rounded-lg border border-border bg-card p-5">
        <div>
          <h2 className="text-base font-semibold">Practice warning: rain + dam together</h2>
          <p className="text-xs text-muted-foreground">
            Move the sliders to see what happens when heavy rain and dam release happen at the same time.
            Then send a demo SMS or WhatsApp to a phone.
          </p>
        </div>

        <SliderRow
          icon={CloudRain}
          label="Simulated rainfall intensity"
          unit="mm/24h upstream"
          value={rain}
          onChange={setRain}
          tier={rainTier}
        />
        <SliderRow
          icon={Dam}
          label="How much fuller the dam gets"
          unit="Change in dam fullness at Gibe III (maps to release for the engine)"
          value={dam}
          onChange={setDam}
          tier={damTier}
        />

        <Button onClick={() => setRan(true)} className="w-full gap-2">
          <Play className="h-4 w-4" />
          Run simulation
        </Button>
      </div>

      {/* Output */}
      <div
        className={cn(
          "rounded-lg border p-5 transition-colors",
          compound === "severe"
            ? "border-risk-severe bg-risk-severe-bg"
            : compound === "warning"
              ? "border-risk-warning bg-risk-warning-bg"
              : compound === "watch"
                ? "border-risk-watch bg-risk-watch-bg"
                : "border-border bg-card",
        )}
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5" />
          <h3 className="text-base font-semibold">Combined flood level</h3>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs">
          <TierChip label="Rainfall" tier={rainTier} />
          <TierChip label="Dam" tier={damTier} />
          <TierChip label="Rain + dam" tier={compound} big />
        </div>

        <div className="mt-5 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sample plain-language alert
          </p>
          <MsgBlock lang="English" text={messageFor(compound, "en")} />
          <MsgBlock lang="Swahili" text={messageFor(compound, "sw")} />
          <MsgBlock lang="Local (Ng'aturkana)" text={messageFor(compound, "local")} />
        </div>

        {ran && (
          <div className="mt-4 rounded-md border border-border bg-background/60 p-3 text-xs text-muted-foreground">
            Simulation ready. In a real event this would send SMS, WhatsApp, and phone-menu
            alerts to communities at this danger level.
          </div>
        )}

        {/* Demo SMS dispatch — proves the end-to-end alert flow in the UI. */}
        <div className="mt-5 space-y-2 rounded-md border border-border bg-background p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Demo dispatch
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["sms", "SMS"],
                ["whatsapp", "WhatsApp"],
                ["both", "SMS + WhatsApp"],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant={channel === id ? "default" : "outline"}
                className="h-8"
                onClick={() => setChannel(id)}
              >
                {label}
              </Button>
            ))}
          </div>
          <Input
            type="tel"
            inputMode="tel"
            placeholder="+254 7XX XXX XXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-9"
          />
          <Button onClick={sendDemoSms} disabled={sending} variant="secondary" className="w-full gap-2">
            <Send className="h-4 w-4" />
            {sending ? "Sending…" : `Send demo ${channel === "both" ? "SMS + WhatsApp" : channel.toUpperCase()}`}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Uses the ALMA engine on port 8787. SMS works with Africa&apos;s Talking sandbox keys.
            WhatsApp needs a registered AT WhatsApp number (<code>AT_WHATSAPP_NUMBER</code>) — no sandbox;
            without it, WhatsApp stays in demo mode.
          </p>
        </div>
      </div>
    </div>
  );
}

function SliderRow({
  icon: Icon,
  label,
  unit,
  value,
  onChange,
  tier,
}: {
  icon: typeof CloudRain;
  label: string;
  unit: string;
  value: number;
  onChange: (v: number) => void;
  tier: RiskTier;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {label}
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold capitalize", tierMeta[tier].badge)}>
          {tier} · {value}
        </span>
      </div>
      <Slider value={[value]} onValueChange={(v) => onChange(v[0])} min={0} max={100} step={1} />
      <p className="mt-1 text-[11px] text-muted-foreground">{unit}</p>
    </div>
  );
}

function TierChip({ label, tier, big = false }: { label: string; tier: RiskTier; big?: boolean }) {
  return (
    <div className={cn("rounded-md border border-border bg-background p-2", big && "ring-2 ring-primary/20")}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 rounded px-2 py-1 font-semibold capitalize", tierMeta[tier].badge, big && "text-sm")}>
        {tierMeta[tier].label}
      </div>
    </div>
  );
}

function MsgBlock({ lang, text }: { lang: string; text: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{lang}</div>
      <div className="mt-1 text-sm leading-snug">{text}</div>
    </div>
  );
}