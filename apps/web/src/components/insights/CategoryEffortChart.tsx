"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CategoryEffort } from "@/types/api";
import { categoryColor, categoryLabel, chartChrome } from "@/lib/colors";

export function CategoryEffortChart({ data }: { data: CategoryEffort[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted">No categorized app time recorded yet.</p>;
  }

  const sorted = [...data].sort((a, b) => b.minutes - a.minutes);

  return (
    <ResponsiveContainer width="100%" height={Math.max(120, sorted.length * 36)}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={chartChrome.gridline} horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={(v: number) => `${v}m`}
          stroke={chartChrome.axis}
          tick={{ fontSize: 11, fill: chartChrome.mutedText }}
        />
        <YAxis
          type="category"
          dataKey="category"
          tickFormatter={(c: string) => categoryLabel(c)}
          stroke={chartChrome.axis}
          tick={{ fontSize: 12, fill: chartChrome.primaryText }}
          width={100}
        />
        <Tooltip
          formatter={(v: number) => [`${v}m`, "time"]}
          labelFormatter={(c: string) => categoryLabel(c)}
          contentStyle={{ borderColor: chartChrome.gridline, fontSize: 12 }}
        />
        <Bar dataKey="minutes" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {sorted.map((entry, i) => (
            <Cell key={i} fill={categoryColor(entry.category)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
