import { Category, State } from "@flow/shared";

/** Status palette (fixed, validated) — never reused for series identity. */
export const status = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
  muted: "#898781",
} as const;

/** State -> status color + label. Status color always ships with a label, never alone. */
export const stateStyle: Record<State, { color: string; label: string }> = {
  [State.Focused]: { color: status.good, label: "Focused" },
  [State.ZonedOut]: { color: status.warning, label: "Zoned out" },
  [State.Spiraling]: { color: status.critical, label: "Spiraling" },
  [State.Warmup]: { color: status.muted, label: "Warming up" },
  [State.NoSignal]: { color: status.muted, label: "No signal" },
};

/** Categorical palette, fixed hue order — validated CVD-safe as an ordered set. */
const categoricalHues = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
] as const;

export const categoryStyle: Record<Category, { color: string; label: string }> = {
  [Category.Study]: { color: categoricalHues[0], label: "Study" },
  [Category.Social]: { color: categoricalHues[1], label: "Social" },
  [Category.Entertainment]: { color: categoricalHues[2], label: "Entertainment" },
  [Category.Productivity]: { color: categoricalHues[3], label: "Productivity" },
  [Category.Communication]: { color: categoricalHues[4], label: "Communication" },
  [Category.System]: { color: categoricalHues[5], label: "System" },
  [Category.Unknown]: { color: status.muted, label: "Unknown" },
};

/** Chart chrome — the dataviz skill's validated light-surface tokens. */
export const chartChrome = {
  surface: "#fcfcfb",
  gridline: "#e1e0d9",
  axis: "#c3c2b7",
  mutedText: "#898781",
  secondaryText: "#52514e",
  primaryText: "#0b0b0b",
} as const;

export function stateColor(state: string): string {
  return stateStyle[state as State]?.color ?? status.muted;
}

export function stateLabel(state: string): string {
  return stateStyle[state as State]?.label ?? state;
}

export function categoryColor(category: string): string {
  return categoryStyle[category as Category]?.color ?? status.muted;
}

export function categoryLabel(category: string): string {
  return categoryStyle[category as Category]?.label ?? category;
}
