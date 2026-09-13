"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EventRow, TimelineBucket } from "@/types/api";
import { chartChrome, stateColor, status } from "@/lib/colors";

interface Band {
  state: string;
  startMs: number;
  endMs: number;
}

function buildBands(points: { tsMs: number; state: string }[], bucketMs: number): Band[] {
  const bands: Band[] = [];
  for (const point of points) {
    const last = bands[bands.length - 1];
    if (last && last.state === point.state) {
      last.endMs = point.tsMs + bucketMs;
    } else {
      bands.push({ state: point.state, startMs: point.tsMs, endMs: point.tsMs + bucketMs });
    }
  }
  return bands;
}

const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

function SyncedChart({
  data,
  bands,
  alertTimes,
  dataKey,
  label,
  color,
}: {
  data: { tsMs: number; value: number | null }[];
  bands: Band[];
  alertTimes: number[];
  dataKey: string;
  label: string;
  color: string;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart syncId="physio-timeline" data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={chartChrome.gridline} vertical={false} />
          <XAxis
            dataKey="tsMs"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(ms: number) => timeFormatter.format(ms)}
            stroke={chartChrome.axis}
            tick={{ fontSize: 11, fill: chartChrome.mutedText }}
          />
          <YAxis stroke={chartChrome.axis} tick={{ fontSize: 11, fill: chartChrome.mutedText }} width={36} />
          <Tooltip
            labelFormatter={(ms: number) => timeFormatter.format(ms)}
            contentStyle={{ borderColor: chartChrome.gridline, fontSize: 12 }}
          />
          {bands.map((band, i) => (
            <ReferenceArea
              key={`band-${i}`}
              x1={band.startMs}
              x2={band.endMs}
              fill={stateColor(band.state)}
              fillOpacity={0.1}
              stroke="none"
              ifOverflow="visible"
            />
          ))}
          {alertTimes.map((ts, i) => (
            <ReferenceLine key={`alert-${i}`} x={ts} stroke={status.critical} strokeDasharray="4 4" ifOverflow="visible" />
          ))}
          <Line dataKey="value" name={dataKey} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PhysioTimeline({ timeline, alerts }: { timeline: TimelineBucket[]; alerts: EventRow[] }) {
  if (timeline.length === 0) {
    return <p className="text-sm text-muted">No physiology data recorded for this session.</p>;
  }

  const points = timeline.map((b) => ({ tsMs: new Date(b.bucket).getTime(), state: b.state }));
  const bucketMs = points.length > 1 ? points[1]!.tsMs - points[0]!.tsMs : 60_000;
  const bands = buildBands(points, bucketMs);
  const alertTimes = alerts.map((a) => new Date(a.ts).getTime());

  const pulseData = timeline.map((b) => ({ tsMs: new Date(b.bucket).getTime(), value: b.avgPulseBpm }));
  const breathingData = timeline.map((b) => ({ tsMs: new Date(b.bucket).getTime(), value: b.avgBreathingRpm }));

  return (
    <div className="space-y-4">
      <SyncedChart
        data={pulseData}
        bands={bands}
        alertTimes={alertTimes}
        dataKey="pulse_bpm"
        label="Pulse (bpm)"
        color="#2a78d6"
      />
      <SyncedChart
        data={breathingData}
        bands={bands}
        alertTimes={alertTimes}
        dataKey="breathing_rpm"
        label="Breathing (rpm)"
        color="#eb6834"
      />
    </div>
  );
}
