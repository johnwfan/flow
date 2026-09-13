export function formatDuration(seconds: number | null): string {
  if (seconds === null || Number.isNaN(seconds)) return "—";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

export function formatShortDate(iso: string): string {
  return shortDateFormatter.format(new Date(iso));
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** "14:12" — 24h clock, used for mono machine-time labels (eyebrows, axes, check-ins). */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "1:12" (h:mm) — the session card / header duration figure, always shown as hours:minutes. */
export function formatHM(seconds: number | null): string {
  if (seconds === null || Number.isNaN(seconds)) return "—";
  const mins = Math.round(seconds / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** "7 m" — a minutes figure with a space before the unit, matching the design's number style. */
export function formatMinutesLabel(seconds: number | null): string {
  if (seconds === null || Number.isNaN(seconds)) return "—";
  return `${Math.round(seconds / 60)} m`;
}

/** "tue 9 sep" — lowercase mono date, for the session-detail eyebrow. */
export function formatDayEyebrow(iso: string): string {
  const d = new Date(iso);
  const wd = d.toLocaleDateString("en-US", { weekday: "short" }).toLowerCase();
  const mon = d.toLocaleDateString("en-US", { month: "short" }).toLowerCase();
  return `${wd} ${d.getDate()} ${mon}`;
}

/**
 * A relative day label ("Today", "Yesterday", a weekday name, or a short
 * date past a week) — there's no session title field in the API, so this
 * stands in for one everywhere a human-readable session title is needed.
 */
export function relativeDayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (dt: Date) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  return shortDateFormatter.format(d);
}

/** "Today's session" / "Sep 9 session" — a derived title, since sessions carry no title field. */
export function sessionTitle(iso: string): string {
  const label = relativeDayLabel(iso);
  return label === "Today" || label === "Yesterday" || !/\d/.test(label) ? `${label}'s session` : `${label} session`;
}
