// TrendChart: 7-day rainfall + reservoir level history, dual axis.
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
import { trend } from "@/lib/turkana-data";

export function TrendChart() {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-5 py-3">
        <h3 className="text-sm font-semibold">7-day trend</h3>
        <p className="text-xs text-muted-foreground">
          Upstream rainfall (mm/24h) and Gibe III reservoir fill (%)
        </p>
      </div>
      <div className="h-64 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="rainFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--risk-warning)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--risk-warning)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} />
            <YAxis yAxisId="left" stroke="var(--muted-foreground)" fontSize={11} />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="var(--muted-foreground)"
              fontSize={11}
              domain={[70, 100]}
            />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="rainfallMm"
              name="Rainfall (mm)"
              stroke="var(--risk-warning)"
              strokeWidth={2}
              fill="url(#rainFill)"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="reservoirPct"
              name="Reservoir (%)"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}