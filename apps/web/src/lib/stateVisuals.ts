import { Category, State } from "@flow/shared";

/**
 * Flow design system — state colour + texture mapping, ported from the
 * prototype's `tex()` function (see "Design Pages/Flow.dc.html"). Every
 * state carries a hue *and* a texture so a ribbon survives greyscale,
 * projection and colour-blindness (README "State ribbon").
 *
 * The prototype's taxonomy (deep_work/zoned_out/spiral/break/no_signal)
 * doesn't map 1:1 onto this app's real state machine (`@flow/shared`'s
 * `State` enum: focused/zoned_out/spiraling/warmup/no_signal — there is no
 * literal "break" state). `warmup` is given the prototype's dot texture and
 * the warm `--break` colour ramp, since both read as "not productive, not
 * a failure" rather than a judgement — the closest real analogue.
 */
export interface StateVisual {
  /** Raw machine name for mono labels, e.g. "zoned_out". Never shown in narrative prose. */
  name: string;
  /** Solid base colour — state dot badges, swatches (never textured). */
  color: string;
  /** Ink step — text/labels set directly on --paper. */
  ink: string;
  /** Mid step — alert stems, secondary marks. */
  mid: string;
  /** Pale step — trace fills, envelopes. */
  pale: string;
  /** Texture layered over colour — ribbon segments and legend chips. */
  texture: string;
}

const HAIRLINES = "repeating-linear-gradient(0deg, oklch(1 0 0 / 0.5) 0 1px, transparent 1px 4px)";
const HACHURE = "repeating-linear-gradient(45deg, oklch(1 0 0 / 0.45) 0 1.5px, transparent 1.5px 5px)";
const DOTS = "radial-gradient(oklch(1 0 0 / 0.55) 1px, transparent 1.2px) 0 0 / 6px 6px";
export const HATCH = "var(--none-hatch)";

const VISUALS: Record<string, StateVisual> = {
  [State.Focused]: {
    name: State.Focused,
    color: "var(--deep)",
    ink: "var(--deep-ink)",
    mid: "var(--deep-mid)",
    pale: "var(--deep-pale)",
    texture: "var(--deep)", // solid — deep_work
  },
  [State.ZonedOut]: {
    name: State.ZonedOut,
    color: "var(--zoned)",
    ink: "var(--zoned-ink)",
    mid: "var(--zoned-mid)",
    pale: "var(--zoned-pale)",
    texture: `${HAIRLINES}, var(--zoned)`,
  },
  [State.Spiraling]: {
    name: State.Spiraling,
    color: "var(--spiral)",
    ink: "var(--spiral-ink)",
    mid: "var(--spiral-mid)",
    pale: "var(--spiral-pale)",
    texture: `${HACHURE}, var(--spiral)`,
  },
  [State.Warmup]: {
    name: State.Warmup,
    color: "var(--break)",
    ink: "var(--break-ink)",
    mid: "var(--break-mid)",
    pale: "var(--break-pale)",
    texture: `${DOTS}, var(--break)`,
  },
  [State.NoSignal]: {
    name: State.NoSignal,
    color: "var(--tick)",
    ink: "var(--mute)",
    mid: "var(--tick)",
    pale: "var(--sink)",
    texture: HATCH,
  },
};

const FALLBACK = VISUALS[State.Focused]!;

/** Canonical legend order — matches the prototype's legend array. */
export const STATE_ORDER: string[] = [State.Focused, State.ZonedOut, State.Spiraling, State.Warmup, State.NoSignal];

export function stateVisual(state: string): StateVisual {
  const known = VISUALS[state];
  if (known) return known;
  return { ...FALLBACK, name: state };
}

/** Full ribbon/legend-chip background: texture layered over the state's base colour. */
export function segmentBackground(state: string): string {
  return stateVisual(state).texture;
}

const CATEGORY_VAR: Record<string, string> = {
  [Category.Study]: "var(--cat-1)",
  [Category.Productivity]: "var(--cat-1)",
  [Category.Communication]: "var(--cat-2)",
  [Category.Social]: "var(--cat-3)",
  [Category.Entertainment]: "var(--cat-3)",
  [Category.System]: "var(--cat-4)",
  [Category.Unknown]: "var(--cat-4)",
};

/** App categories are always indigo tints — never confusable with a state colour. */
export function categoryVar(category: string | null | undefined): string {
  return CATEGORY_VAR[category ?? ""] ?? "var(--cat-4)";
}
