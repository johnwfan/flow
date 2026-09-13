"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SettlePoint } from "@/types/api";
import { chartChrome } from "@/lib/colors";
import { formatShortDate } from "@/lib/format";

export function SettleTrendChart({ data }: { data: SettlePoint[] }) {
  const points = data.filter((p) => p.settleSeconds !== null);
  if (points.length === 0) {
    return <p className="text-sm text-muted">Not enough sessions yet to show a trend.</p>;
  }

  const chartData = points.map((p) => ({ date: p.date, settleMinutes: (p.settleSeconds ?? 0) / 60 }));

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={chartChrome.gridline} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => formatShortDate(d)}
          stroke={chartChrome.axis}
          tick={{ fontSize: 11, fill: chartChrome.mutedText }}
        />
        <YAxis
          tickFormatter={(v: number) => `${v.toFixed(0)}m`}
          stroke={chartChrome.axis}
          tick={{ fontSize: 11, fill: chartChrome.mutedText }}
          width={36}
        />
        <Tooltip
          formatter={(v: number) => [`${v.toFixed(1)}m`, "time to settle"]}
          labelFormatter={(d: string) => formatShortDate(d)}
          contentStyle={{ borderColor: chartChrome.gridline, fontSize: 12 }}
        />
        <Line dataKey="settleMinutes" stroke="#2a78d6" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
