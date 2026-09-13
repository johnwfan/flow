export function HeroFigure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-5xl font-semibold tracking-tight text-ink">{value}</div>
      <div className="mt-1 text-sm text-muted">{label}</div>
    </div>
  );
}
