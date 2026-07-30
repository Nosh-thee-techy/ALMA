// TrendChart: supporting 7-day context — not the emotional end of the crisis path.
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
    <div className="bg-card">
      <div className="border-b border-border px-5 py-3">
        <p className="text-sm font-bold">Rain vs reservoir fill</p>
        <p className="text-xs text-muted-foreground">
          Left axis: rainfall mm/day · Right axis: Gibe III fill % (simulated)
        </p>
      </div>
      <div className="h-64 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
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
              domain={[70, 100]}
              label={{ value: "%", position: "insideTopRight", offset: 0, fontSize: 11 }}
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
              name="Reservoir fill % (simulated)"
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
