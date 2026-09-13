"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { InterventionEfficacyPoint } from "@/types/api";
import { chartChrome } from "@/lib/colors";

const BEFORE_COLOR = "#86b6ef"; // sequential blue, lighter step
const AFTER_COLOR = "#1c5cab"; // sequential blue, darker step

export function InterventionEfficacyChart({ data }: { data: InterventionEfficacyPoint[] }) {
  const points = data.filter((p) => p.breathingRpmBefore !== null || p.breathingRpmAfter !== null);
  if (points.length === 0) {
    return <p className="text-sm text-muted">No interventions recorded yet.</p>;
  }

  const chartData = points.map((p, i) => ({
    label: `#${i + 1}`,
    before: p.breathingRpmBefore,
    after: p.breathingRpmAfter,
  }));

  return (
    <>
      <p className="mb-2 text-xs text-muted">
        Breathing rate (rpm) around each alert, as a proxy for intervention effect — a lower &quot;after&quot; bar
        means the breathing guide helped calm things down.
      </p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={chartChrome.gridline} vertical={false} />
          <XAxis dataKey="label" stroke={chartChrome.axis} tick={{ fontSize: 11, fill: chartChrome.mutedText }} />
          <YAxis stroke={chartChrome.axis} tick={{ fontSize: 11, fill: chartChrome.mutedText }} width={36} />
          <Tooltip contentStyle={{ borderColor: chartChrome.gridline, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="before" name="Before" fill={BEFORE_COLOR} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="after" name="After" fill={AFTER_COLOR} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}
