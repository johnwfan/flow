"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FocusWindow } from "@/types/api";
import { HeroFigure } from "@/components/ui/HeroFigure";
import { chartChrome } from "@/lib/colors";

export function FocusWindowChart({ data }: { data: FocusWindow }) {
  return (
    <div>
      <HeroFigure
        value={data.medianMinutes === null ? "—" : `${data.medianMinutes}m`}
        label="typical time before first drop-off"
      />
      {data.decayCurve.length > 0 && (
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={data.decayCurve} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={chartChrome.gridline} vertical={false} />
              <XAxis
                dataKey="minute"
                tickFormatter={(m: number) => `${m}m`}
                stroke={chartChrome.axis}
                tick={{ fontSize: 11, fill: chartChrome.mutedText }}
              />
              <YAxis
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
                stroke={chartChrome.axis}
                tick={{ fontSize: 11, fill: chartChrome.mutedText }}
                width={36}
              />
              <Tooltip
                formatter={(v: number) => [`${v}%`, "still focused"]}
                labelFormatter={(m: number) => `${m} min in`}
                contentStyle={{ borderColor: chartChrome.gridline, fontSize: 12 }}
              />
              {data.medianMinutes !== null && (
                <ReferenceLine x={data.medianMinutes} stroke={chartChrome.axis} strokeDasharray="4 4" />
              )}
              <Line dataKey="pctStillFocused" stroke="#2a78d6" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
