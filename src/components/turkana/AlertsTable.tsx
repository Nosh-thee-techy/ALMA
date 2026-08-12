// AlertsTable: live USSD/engine actions (+ mock history only if engine offline).
import { useMemo, useState } from "react";
import { CloudRain, Dam, ShieldAlert } from "lucide-react";
import { LiveSourceBadge } from "@/components/turkana/LiveSourceBadge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLiveBasin } from "@/hooks/use-live-basin";
import { tierMeta, verificationMeta, type RiskTier, type TriggerType } from "@/lib/turkana-data";
import { cn } from "@/lib/utils";

const triggerIcon = { rain: CloudRain, dam: Dam, compound: ShieldAlert };
const triggerLabel: Record<TriggerType, string> = {
  rain: "Rainfall",
  dam: "Dam release",
  compound: "Rain + dam",
};

export function AlertsTable() {
  const { data, loading, error, isLive } = useLiveBasin();
  const [severity, setSeverity] = useState<"all" | RiskTier>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(() => {
    return data.alerts.filter((a) => {
      if (severity !== "all" && a.severity !== severity) return false;
      const t = a.timestamp.slice(0, 10);
      if (from && t < from) return false;
      if (to && t > to) return false;
      return true;
    });
  }, [data.alerts, severity, from, to]);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-end gap-3 border-b border-border px-5 py-4">
        <div className="flex-1 min-w-[200px]">
          <h2 className="text-base font-semibold">Alerts log</h2>
          <p className="text-xs text-muted-foreground">
            Live USSD actions and field reports from the ALMA engine.
          </p>
        </div>
        <LiveSourceBadge isLive={isLive} loading={loading} error={error} />
        <div>
          <label className="text-xs font-medium text-muted-foreground">From</label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 w-[150px]"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">To</label>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 w-[150px]"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Severity</label>
          <Select value={severity} onValueChange={(v) => setSeverity(v as "all" | RiskTier)}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              <SelectItem value="safe">Safe</SelectItem>
              <SelectItem value="watch">Watch</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="severe">Severe</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Timestamp</TableHead>
            <TableHead>Trigger</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Verification</TableHead>
            <TableHead>Communities</TableHead>
            <TableHead>Delivery</TableHead>
            <TableHead>Message</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((a) => {
            const Icon = triggerIcon[a.trigger];
            const meta = tierMeta[a.severity];
            return (
              <TableRow key={a.id}>
                <TableCell className="whitespace-nowrap font-mono text-xs">{a.timestamp}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {triggerLabel[a.trigger]}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize",
                      meta.badge,
                    )}
                  >
                    {a.severity}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium",
                      verificationMeta[a.verification].badge,
                    )}
                  >
                    {verificationMeta[a.verification].label}
                  </span>
                </TableCell>
                <TableCell className="text-xs">{a.communities.join(", ")}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {a.delivery.map((d) => (
                      <span
                        key={d}
                        className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="max-w-[280px] text-xs text-muted-foreground">
                  {a.message}
                </TableCell>
              </TableRow>
            );
          })}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                No alerts yet. Trigger a USSD action or wait for the next live poll.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
