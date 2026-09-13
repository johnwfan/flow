// The design system's plot-frame gridlines: `rows` horizontal divisions plus
// always 4 vertical divisions, both in --line-soft, drawn under the data --
// same geometry as the prototype's canvas `grid()` helper, ported to SVG.
export function PlotGrid({ width, height, rows }: { width: number; height: number; rows: number }) {
  const hLines = Array.from({ length: Math.max(0, rows - 1) }, (_, i) => (height / rows) * (i + 1));
  const vLines = [1, 2, 3].map((i) => (width / 4) * i);
  return (
    <g stroke="var(--line-soft)" strokeWidth={1}>
      {hLines.map((y, i) => (
        <line key={`h${i}`} x1={0} y1={y} x2={width} y2={y} />
      ))}
      {vLines.map((x, i) => (
        <line key={`v${i}`} x1={x} y1={0} x2={x} y2={height} />
      ))}
    </g>
  );
}
