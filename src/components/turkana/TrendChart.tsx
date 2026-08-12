// TrendChart: 7-day rain context — prefers live Open-Meteo series when provided.
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { trend as mockTrend, type TrendPoint } from "@/lib/turkana-data";

export function TrendChart({ data, live = false }: { data?: TrendPoint[]; live?: boolean }) {
  const series = data && data.length > 0 ? data : mockTrend;

  return (
    <div className="bg-card">
      <div className="border-b border-border px-5 py-3">
        <p className="text-sm font-bold">
          {live ? "Live rain vs pressure index" : "Rain vs reservoir fill"}
        </p>
        <p className="text-xs text-muted-foreground">
          Left axis: rainfall mm/day · Right axis:{" "}
          {live ? "estimated pressure index (not Gibe SCADA %)" : "Gibe III fill % (simulated)"}
        </p>
      </div>
      <div className="h-64 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="rainFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
            <YAxis
              yAxisId="left"
              stroke="var(--muted-foreground)"
              fontSize={12}
              label={{ value: "mm", position: "insideTopLeft", offset: 0, fontSize: 11 }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="var(--muted-foreground)"
              fontSize={12}
              domain={[40, 100]}
              label={{
                value: live ? "idx" : "%",
                position: "insideTopRight",
                offset: 0,
                fontSize: 11,
              }}
            />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 13,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="rainfallMm"
              name="Rainfall (mm)"
              stroke="var(--chart-2)"
              strokeWidth={2}
              fill="url(#rainFill)"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="reservoirPct"
              name={live ? "Pressure index" : "Reservoir fill % (simulated)"}
              stroke="var(--chart-1)"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
