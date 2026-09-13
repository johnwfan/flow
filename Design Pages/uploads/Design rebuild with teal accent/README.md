# Handoff: Flow — Design System

## Overview

Flow is a webcam-based focus and physiology coach. During a work session it reads pulse, breathing, blink rate and gaze from the camera, cross-references that against what is on screen, and names states the user is in — including "eyes on the page, brain gone," which nothing else measures. It intervenes live with voice-guided breathing and explains the pattern afterward in a multi-session dashboard. Single user, single machine, no accounts.

This bundle is the **design system** plus two applied proof points (Active session, Session detail). It defines colour, type, space, shape, motion, the state/evidence pattern, the confidence meter, chart vocabulary, the alert family, the breathing pacer, session components, edge states and voice.

## About the Design Files

The file in this bundle (`Flow.dc.html`) is a **design reference created in HTML** — a working prototype showing intended look, behaviour and live motion. It is **not production code to copy directly.**

The task is to **recreate these designs in the target codebase's existing environment** (React, Vue, Svelte, SwiftUI, native, etc.) using its established patterns, component library and state management. If no environment exists yet, choose the most appropriate framework for the project and implement the designs there.

One thing *should* be ported nearly verbatim: the **design token block** (see Design Tokens below). It is already authored as CSS custom properties and is the single source of truth for every value in the system.

The prototype is a single self-contained file with an internal three-tab switcher (Foundations / Active session / Session detail). That switcher is a documentation device, not product navigation — do not build it.

## Fidelity

**High-fidelity.** Final colours, typography, spacing, radii, shadows, motion timing and copy. Recreate the UI precisely using the codebase's existing libraries where they fit.

Two caveats:
- The waveforms, sparklines, decay curve and session trace are drawn on `<canvas>` with synthetic sample data. In production, feed them real data — uPlot, visx, Recharts or a hand-rolled canvas renderer are all fine. What must be preserved is the **frame**: axis treatment, gridline colour, trace colour rules, and the signal-lost overlay.
- Sample physiology values are realistic placeholders (resting HR 55–85 bpm, breathing 12–20/min, HRV 46–112 ms, confidence 0–1). Do not treat them as fixtures.

---

## Design Tokens

Port this block first; everything else references it. Authored as CSS custom properties on `:root`.

### Colour — neutrals

| Token | Value | Use |
|---|---|---|
| `--paper` | `oklch(0.985 0.004 268)` | Page background. Everything sits directly on this. |
| `--raise` | `oklch(1 0 0)` | Top of a raised control gradient. |
| `--sink` | `oklch(0.968 0.005 268)` | Recessed grooves, inset wells, quiet chip fills. |
| `--line` | `oklch(0.905 0.010 268)` | Section rules, control rings. |
| `--line-soft` | `oklch(0.935 0.008 268)` | Inner rules, list dividers, chart gridlines. |
| `--tick` | `oklch(0.80 0.018 268)` | Cross marks, threshold ticks. |
| `--ink` | `oklch(0.22 0.028 268)` | Primary text. |
| `--body` | `oklch(0.44 0.024 268)` | Body copy, secondary text. |
| `--mute` | `oklch(0.54 0.022 268)` | Labels, captions, axis text. |

All neutrals are blue-tinted (hue 268) so they sit in one family with the accents.

### Colour — states

Four states, each with a four-step ramp. **Chroma encodes urgency.**

| State | Base | Ink (text on paper) | Mid | Pale | Meaning |
|---|---|---|---|---|---|
| `deep_work` | `--deep: oklch(0.56 0.185 255)` | `--deep-ink: oklch(0.42 0.17 255)` | `--deep-mid: oklch(0.72 0.13 255)` | `--deep-pale: oklch(0.87 0.06 255)` | Vivid blue. The state you want to be in. Also live traces and primary data. |
| `zoned_out` | `--zoned: oklch(0.66 0.038 248)` | `--zoned-ink: oklch(0.45 0.042 248)` | `--zoned-mid: oklch(0.76 0.030 248)` | `--zoned-pale: oklch(0.90 0.018 248)` | Grey-blue. Arousal **falling** — deep_work's hue with the chroma drained out. Deliberately the least saturated state. |
| `spiral` | `--spiral: oklch(0.63 0.215 32)` | `--spiral-ink: oklch(0.47 0.19 32)` | `--spiral-mid: oklch(0.76 0.15 32)` | `--spiral-pale: oklch(0.90 0.065 32)` | Bright red-orange. Arousal **climbing** — the highest chroma in the system, because it is the only state asking for something. Stops short of alarm red. |
| `break` | `--break: oklch(0.80 0.105 82)` | `--break-ink: oklch(0.45 0.09 75)` | `--break-mid: oklch(0.86 0.085 82)` | `--break-pale: oklch(0.94 0.04 82)` | Warm amber. Away from the blue entirely. Rest is not a failure state. |

`--none` (no_signal): `repeating-linear-gradient(45deg, oklch(0.90 0.012 268) 0 4px, oklch(0.962 0.006 268) 4px 8px)`

**Hard rules:**
- `zoned_out` and `spiral` are physiologically opposite and must never share a colour language.
- No true alarm red anywhere.
- Missing data is **hatched, never coloured, never interpolated, never drawn as a low value.**

### Colour — product identity

| Token | Value | Use |
|---|---|---|
| `--indigo` | `oklch(0.30 0.075 268)` | Primary buttons, the mark. Bottom of the gradient. |
| `--indigo-lift` | `oklch(0.36 0.082 268)` | Top of the primary gradient. |
| `--indigo-hi` | `oklch(0.40 0.088 268)` | Primary hover. |
| `--cat-1` | `oklch(0.46 0.075 268)` | App category — writing. |
| `--cat-2` | `oklch(0.68 0.045 268)` | App category — reading / email. |
| `--cat-3` | `oklch(0.88 0.014 268)` | App category — other. |

Indigo belongs to the **product**, not to any reading. Because it never reports physiology, a filled indigo surface is always Flow speaking. App categories are indigo tints specifically so they can never be confused with a state colour.

### Evening variant

Set `data-mode="dim"` on the root to re-point four neutrals. Nothing else changes.

```
--paper: oklch(0.935 0.008 268);
--raise: oklch(0.965 0.006 268);
--sink:  oklch(0.915 0.010 268);
--line:  oklch(0.865 0.014 268);
--line-soft: oklch(0.895 0.012 268);
--ink:   oklch(0.26 0.030 268);
--body:  oklch(0.42 0.026 268);
--mute:  oklch(0.50 0.024 268);
```

### Spacing — 4px ramp

`--s1: 4px` · `--s2: 8px` · `--s3: 12px` · `--s4: 16px` · `--s5: 24px` · `--s6: 32px` · `--s7: 48px` · `--s8: 64px` · `--s9: 96px`

Section vertical rhythm is `--s7` top / `52px` bottom. Page gutters are `34px`. Content is inset `12px` from the container edge to meet the rule ends.

### Radius

`--r-sm: 8px` (marks, code chips) · `--r-md: 12px` (swatches) · `--r-lg: 16px` (media) · `--r-xl: 24px` (regions, alert card) · `--r-pill: 999px` (all controls, all ribbons)

Nothing has a true corner **except a plot** — chart canvases are square-cornered and sit flush on `--paper`.

### Typography

- `--sans: 'Instrument Sans', system-ui, sans-serif` — everything human.
- `--num: 'Instrument Sans', system-ui, sans-serif` — all numbers. Same face, **always with `font-variant-numeric: tabular-nums`.**
- `--mono: 'Geist Mono', ui-monospace, monospace` — machine names only.

Google Fonts: `Instrument Sans` 400/500/600/700, `Geist Mono` 400/500/600.

| Token | Size | Use |
|---|---|---|
| `--t-hero` | 64px / 0.98 / −0.05em / 500 | Page hero |
| `--t-display` | 36px / −0.045em / 500 | Screen title |
| `--t-title` | 23px / 1.1 / −0.04em / 500 | Section heading |
| `--t-lede` | 18px / 1.55 | Lede, coaching copy |
| `--t-body` | 14px | Sub-heads |
| `--t-cap` | 13px / 1.5 | Caption, legend, helper |
| `--t-micro` | 11.5px | Meta, chips |
| `--t-mono` | 10.5px | Machine labels |

Hero numbers: 52–56px, weight 500, `letter-spacing: -0.055em`, `line-height: 0.9`.

**Typography rules:**
- Mono is reserved for machine names (`deep_work`), token names (`--deep`), evidence strings (`HR steady 61`) and literal commands (`run.bat`). **Nothing else, including numbers.**
- Narrative never prints a machine name. "You're in it" — not "State: deep_work."
- Every live-shifting number is tabular, so a digit change never shifts the layout.
- No serif anywhere. Sentence case everywhere — no title case, no exclamation marks.

### Motion

`--dur-1: 160ms` — under the finger: press, hover, chip select.
`--dur-2: 280ms` — entering/leaving: alert, probe, panel.
`--dur-3: 450ms` — a state change recolouring the whole screen.
`--ease: cubic-bezier(.32,.72,0,1)` — fast out, long settle. **Never bounce.**

### Shadow

- Raised control: `inset 0 1px 0 oklch(1 0 0), 0 0 0 1px var(--line), 0 1px 2px oklch(0.22 0.028 268 / 0.08)`
- Primary button: `inset 0 1px 0 oklch(1 0 0 / 0.22), 0 1px 2px oklch(0.22 0.028 268 / 0.3), 0 3px 8px oklch(0.22 0.028 268 / 0.14)`
- Recessed groove: `inset 0 1px 2px oklch(0.22 0.028 268 / 0.09)`
- Alert overlay: `0 2px 4px oklch(0.22 0.028 268 / 0.05), 0 24px 60px oklch(0.22 0.028 268 / 0.16)`

---

## Layout system

**There are no cards.** No white boxes, no tinted trays, no drop-shadowed panels around content. Everything sits directly on `--paper`. Structure comes from an inset rule grid:

- A section is `display: grid; grid-template-columns: 210px minmax(0, 1fr); gap: var(--s5)` — a label column (heading + one-sentence description) and a content column.
- The section's top border is drawn as **two absolutely positioned 1px rules** that stop short of both page edges (inset 12px) *and* stop short of each other, leaving a gap where the vertical column rule crosses.
- In that gap sits a **cross**: two 11px strokes (1px wide, `--tick`) crossing at the intersection — they mark the crossing without touching the rules.
- The vertical rule (`--line-soft`) starts 14px below the cross and stops 22px above the section bottom.

Exact geometry, for a 210px label column with a 24px gap (crossing point at x = 220px):

```
left rule:   position: absolute; top: 0; left: 12px; width: 199px; height: 1px; background: var(--line);
right rule:  position: absolute; top: 0; left: 229px; right: 12px; height: 1px; background: var(--line);
vertical:    position: absolute; top: 14px; bottom: 22px; left: 220px; width: 1px; background: var(--line-soft);
cross wrap:  position: absolute; top: -5px; left: 215px; width: 11px; height: 11px;
  cross h:   position: absolute; top: 5px; left: 0; width: 11px; height: 1px; background: var(--tick);
  cross v:   position: absolute; left: 5px; top: 0; width: 1px; height: 11px; background: var(--tick);
```

The Active session screen uses the same device mirrored: content column + 260px numbers rail, 30px gap, rules and cross positioned from the right.

Page max-widths: 1180px (Foundations, Session detail), 1220px (Active session).

### Responsive

Single breakpoint at **820px**. Below it: both grids collapse to one column, the right-hand rule and the vertical rule and cross are hidden, and the left rule spans the full width. Everything else reflows naturally — no fixed heights on text containers.

---

## Components

### State badge + reasons

The signature pattern. **Flow never names a state without showing its work.**

- Badge: a 7px square swatch (`border-radius: 2.5px`) + the machine name in mono 12px, in that state's `ink`.
- Reasons: a vertical hairline list (not chips, not pills) — mono 10.5px, `--body`, each row `padding: 6px 0` with `border-top: 1px solid var(--line-soft)`. Preceded by a plain label "What it saw" in 11.5px `--mute`.
- Reasons are per-state and derived from live values, e.g. deep_work: `HR steady 61`, `I:E 1 : 1.9`, `blink 15 /min`, `gaze on-task 94%`, `no app switches 11m`.
- `break` and `no_signal` carry **no reasons**, because neither is a judgement.

### State ribbon (the session's shape at a glance)

- A flex row, `gap: 3px`, `border-radius: var(--r-pill)`, `overflow: hidden`. **Segments are square; only the ribbon's two ends are round.** Each segment is `flex: <duration in minutes>`.
- Heights: 22px (specimen), 18px (session timeline), 7–10px (session card, header).
- **Every state carries a texture as well as a hue**, so the ribbon survives greyscale, projection and colour-blindness:
  - `deep_work` — solid
  - `zoned_out` — `repeating-linear-gradient(0deg, oklch(1 0 0 / 0.5) 0 1px, transparent 1px 4px)` (horizontal hairlines)
  - `spiral` — `repeating-linear-gradient(45deg, oklch(1 0 0 / 0.45) 0 1.5px, transparent 1.5px 5px)` (dense diagonal)
  - `break` — `radial-gradient(oklch(1 0 0 / 0.55) 1px, transparent 1.2px)` with `background-size: 6px 6px` (dots)
  - `no_signal` — the `--none` hatch
  - Texture is layered over the fill: `background: <texture>, <fill>`.

### Confidence meter

One component, one spec, used identically everywhere.

- A 4px `--r-pill` track in `--line-soft`, a fill in the current state's base colour, and a **1px threshold tick at 55%** in `--tick` extending 5px above and below the track.
- Value shown to two decimals, tabular, right-aligned in a 32px column.
- Always a range, never a pass/fail light. Below 0.55 the fill goes `--tick` grey and Flow **keeps reading but stops interrupting** — and says so in helper text.
- Axis labels below: `0.0` / `alerts begin` / `1.0`.

### Waveform / plot frame

- Canvas sits **flush on `--paper`, square-cornered**, no fill, no border.
- Gridlines: 3 horizontal rows (pulse) or 2 (breathing) or 4 (session trace) plus 4 vertical divisions, all `--line-soft`, drawn **under** the data at 1px with a 0.5px offset for crispness.
- Header row above the plot: name in 13px `--body` left, meta in `--num` tabular right ("rolling 60 s", "I:E 1 : 1.9").
- Axis labels below the plot in `--num` tabular 10px `--mute`: `−60s / −45s / −30s / −15s / now`.
- Trace: 1.6–2.2px stroke in the state's base colour, with a fill beneath in the state's `pale`. A 2.8px dot marks the live end.
- Heights: 160px (pulse), 96px (breathing, specimens), 152px (session trace), 26px / 18px (sparklines).

### Signal-lost overlay

- The plot is covered by `repeating-linear-gradient(45deg, oklch(0.90 0.012 268 / 0.65) 0 5px, var(--paper) 5px 10px)`.
- Centred pill label on `--paper`, `--num` 11.5px: **"signal lost · not interpolated"**.
- In the session trace, the gap is drawn into the canvas itself: the polyline is **split into separate segments** around the gap and the gap region is filled with `--paper` plus 1px diagonal hatch strokes. Nothing is ever drawn across it.

### Alert card family

One shape, three moods. Structure never changes; only the 2px top rule colour and the label ink do.

- Header row: machine name in mono `--t-mono` in the mood's ink, meta right-aligned in 11.5px `--mute` ("soft chime", "voice-guided", "you started this"), with `border-bottom: 2px solid <mood colour>` beneath.
- Title 24–26px, −0.04em, weight 500. Body 13.5px / 1.5 in `--body`, max 42ch.
- Actions: one primary, one secondary, and a quiet **"Not now"**. Every intervention is refusable in one click, and refusing is never scored.
- Moods: zone-out (`--zoned`), spiral (`--spiral`), manual (`--line`).

**In context** (the important part): the alert appears as an overlay anchored `bottom: 0; right: 0` over the live plots, `width: min(420px, 100%)`, `padding: var(--s5)`, `border-radius: var(--r-xl)`, on `--raise` with the alert shadow. **The plots behind it fade to `opacity: 0.35`** over `--dur-2`. Role: `alertdialog`.

### Breathing pacer

Two rhythms that must never be mistaken for each other. Both live in a 120px square.

- **Upregulate** (zone-out reset, 4 in / 4 out): two concentric rings starting at 36px. On an 8s cycle, `scale(1 → 2.7)` with `0.5 - cos(e·π)/2` easing; opacity `0.5 → 1`. The outer ghost ring scales further (`→ 3.4`) and fades out. Colour `--zoned`. Reads as *pulsing, brightening, even*.
- **Extended exhale** (spiral, 4 in / 8 out): one 92px ring on a 12s cycle — one third inhale, two thirds exhale — `scale(0.52 → 1)`, plus a 106px arc (two borders transparent) rotating a full turn per cycle. Colour `--spiral`. Reads as *one slow contraction with a sweep*.
- Centre label in mono 10px shows the phase and count: `in 4` / `out 8`.

### Session card

- A row, not a card: `grid-template-columns: minmax(0, 1fr) 110px`, `padding: var(--s4) 0`, hairline top and bottom, hover fills `--sink`.
- Title 18px/600/−0.025em + date 12px `--mute` on one baseline; the **state ribbon** at 7px beneath; then a meta row in 12px `--mute` ("2 interventions", "settled in 7 m", "signal 0.88").
- Right column: duration 24px tabular, `% deep` 10.5px `--mute` beneath.
- **All session figures must derive from one schedule object** — see State Management. The card and the detail page describe the same session and must never disagree.

### Buttons

- **Primary** — `linear-gradient(var(--indigo-lift), var(--indigo))`, white text, pill, with the inset top highlight + two-layer shadow above. One per view.
- **Secondary** — `linear-gradient(var(--raise), var(--sink))`, `--ink` text, pill, hairline ring. Carries every reversible action.
- **Quiet** — transparent, `--body` text; hover fills `--sink`. For anything that dismisses.
- **Disabled** — keeps its shape, drops to `opacity: 0.42`, loses its shadow. It never disappears, because a control that vanishes teaches nothing.
- **Loading** — secondary with a 9px ring spinner (`border-top-color: var(--indigo)`).
- All buttons: `transform: translateY(1px)` on `:active`; focus ring `0 0 0 3px oklch(0.56 0.185 255 / 0.35)` on `:focus-visible`.
- Segmented control: a recessed groove (`--sink` + inset shadow, pill) with the selected chip raised on top of it (`--raise` gradient + highlight + drop shadow).

### Charts — four shapes cover every view

1. **Trace** — a signal over time (above).
2. **Curve** — focus-window decay. `0.96·e^(−1.05x) + 0.08`, 1.8px `--deep` stroke, `--deep-pale` fill, with a 1px `--tick` marker line and a 3px dot at the inflection.
3. **Bars** — effort by app category. Label 66px left, 10px pill track in `--sink`, fill in `--cat-*`, value right-aligned tabular.
4. **Matrix** — classifier against self-report. 2×2 of `--r-sm` cells; agreement cells tinted `oklch(0.56 0.185 255 / 0.12 → 0.90)` by magnitude with white text above 60% intensity; disagreement cells `--sink`. Row labels in **mono**, column heads in sans. Footer stats: `n`, `agreement`, `false alarms` — false-alarm rate is presented as credibility, not clutter.

**Chart rules:** physiology is coloured by state; app categories are always indigo tints; gridlines are `--line-soft` and never cross the data; axis labels live outside the plot; no legend if the chart can label itself.

**Not-enough-data state:** a chart never draws a trend it can't support. It fills its box with the `--none` hatch, states what it still needs ("3 of 8 sessions needed"), and **keeps the space it will occupy** so the layout doesn't jump when data arrives.

### Edge states (all designed, all required)

- **Waiting for agent** — pulsing `--break` dot, "Flow isn't listening yet.", instruction to start the local agent, and `run.bat` in a mono `--r-sm` chip on `--sink`.
- **Camera refused** — hatched swatch, "No camera, no reading.", "Flow can't infer anything without the frames, and won't pretend otherwise." + secondary action.
- **Calibrating (4 min)** — `--deep` dot, "Learning your baseline.", a 4px progress track and a tabular countdown. Waveforms are already live; clearly non-alertable.
- **Mostly unreadable session** — hatched swatch, "Too dark to say much.", "61% of this session was below threshold. The timeline is kept, the narrative is withheld — a story needs evidence." + a ribbon that is mostly hatch.
- **Empty history** — "No sessions yet" + the four-minute baseline explanation + the local-processing promise + a primary "Start a session".

---

## Screens

### 1. Active session

The live instrument panel. Numbers must not jitter the layout.

**Layout:** header row (state dot + sensing label, 36px title; right side: state preview control, elapsed time, Pause, End session), then the rule-grid split — content column + 260px rail.

**Content column, top to bottom:**
1. State block — badge, 32px headline (max 24ch), 13.5px since-line; "What it saw" reasons list on the right at min 186px.
2. Pulse plot (160px) with header and signal-lost overlay.
3. Breathing plot (96px) with `I:E` in the header.
4. Shared axis row.
5. Hairline divider, then two columns: **On screen** (category name 19px, "docs · 11 min unbroken", a 5px category ribbon, legend) and **Signal** (the confidence meter + its note).

**Rail, top to bottom:**
1. "Right now" + hero HR at 56px tabular in the state's ink, with `bpm` at 14px.
2. A 26px HR sparkline + a trend delta (`+2.4 / 12s`) coloured `--spiral-ink` when rising, `--zoned-ink` when falling, `--mute` when within ±1.5.
3. Three metric rows (Variability / Breathing / Blinks), each with an 18px sparkline and a tabular value.
4. Camera status with a hatched thumbnail placeholder — "Camera on / Stays on this machine."
5. Thought probe — "Where are you right now?", Focused (state-tinted, ringed) and Drifting (secondary), a 20px SVG countdown ring plus a numeric countdown, and "Disappears on its own. There's no wrong answer."
6. Alert preview triggers (documentation only — do not ship).

**State recolouring:** changing state re-colours the state dot and badge, both traces and their fills, the hero HR, the confidence fill, the sparklines, the probe ring and the Focused button — all over `--dur-3`.

### 2. Session detail

The calmer narrative register. Same system, different rhythm.

1. **Header** — state dot + date range, 36px title, a 340px-max state ribbon beneath; right side: four stats (Deep work in `--deep-ink`, Duration, Settled in, Mean signal) at 24px tabular.
2. **Narrative** — label column reads "What happened / written for you". A 33px lede (max 38ch) then a 18px body paragraph (max 68ch). Three takeaway lines beneath, separated by rules — the first carries a 2px `--deep` rule, the rest 1px `--line`. The narrative is prominent but never prints a machine name.
3. **How it went** — legend, then a **marker lane** (20px, holding the alert labels), the 18px state ribbon, the 152px HR trace with an HRV envelope and vertical alert stems, a 6px app-category ribbon, and the clock axis. Alert labels sit in their own lane above the ribbon with their centres on the band boundaries they mark — never overlapping the bands.
4. **Check-ins** — probe answers vs predicted state as a hairline list (time / said / → / predicted / verdict), then Agreement, Check-ins, False alarms.
5. **When Flow stepped in** — two interventions with a state swatch, name, timestamp + outcome, a sentence of result, and a before → after measure (`HR 54 → 62`, `I:E 1 : 1.1 → 1 : 2.1`). Closing line: "All figures are camera-based physiological estimates, not clinical measurements."

---

## Interactions & Behavior

- **Live values** tick once per second, easing 16% toward the current state's target with bounded jitter — they drift, they don't jump. Canvases redraw at ~30fps.
- **State change** recolours the whole screen over `--dur-3` with `--ease`.
- **Alert** enters over `--dur-2`, anchored bottom-right, dimming the plots to 0.35. Dismissible three ways, one of which is "Not now".
- **Thought probe** self-dismisses after 20s with both a ring and a numeral counting down. It is a check-in, not a quiz — no wrong answer, and declining is not recorded as a failure.
- **Signal loss** immediately hatches both plots, blanks all numbers to `--`, drops confidence below threshold and suppresses alerts. **Nothing is interpolated.**
- **Hover:** session rows fill `--sink`; buttons deepen their shadow rather than just swapping colour.

### Accessibility (non-negotiable)

- **`prefers-reduced-motion`:** all transitions collapse to 0.001ms; the state dot, sensing dot and waiting dot stop pulsing; the spinner freezes; and the **breathing pacer becomes a stepped cadence** — the ring snaps once per phase and the label carries the count ("in 4" / "out 8") instead of scaling continuously. A tool for dysregulated attention must never be the thing making someone feel worse.
- **State is never encoded by colour alone** — every state carries its texture (above).
- **Keyboard:** the state control is a `radiogroup` with `aria-checked`, roving `tabindex`, and Arrow/Home/End navigation that moves focus with selection. Visible `:focus-visible` ring on every control.
- **Canvases** carry `role="img"` and a **live** `aria-label` describing current data, e.g. "Pulse waveform, currently 61 beats per minute, state deep_work". Regenerate these as data changes.
- **No `title`-attribute tooltips** — they are not keyboard-accessible. Label things visibly.
- Contrast: all small text uses `--body` or `--mute` on `--paper` (≥ 5.3:1). White text on a state fill only over the `ink` step, never the base.

---

## State Management

Per-session live state:

```
tab, view (deep_work|zoned_out|spiral|break|no_signal), mode (day|dim),
alert (null|'zone'|'spiral'),
hr, hrv, br, blink, gaze, conf, elapsed, probeLeft, lost, reduced
```

Plus a rolling 40-sample history per metric for the sparklines.

**Per-state targets** (drive the live simulation; in production these come from the classifier):

| State | HR | HRV | BR | Blink | Gaze | Conf |
|---|---|---|---|---|---|---|
| deep_work | 61 | 78 | 12.8 | 15 | 94 | 0.91 |
| zoned_out | 55 | 92 | 11.8 | 4 | 88 | 0.86 |
| spiral | 81 | 48 | 18.6 | 21 | 61 | 0.83 |
| break | 67 | 84 | 14.2 | 17 | 22 | 0.74 |
| no_signal | — | — | — | — | — | 0.28 |

**Critical: one schedule is the source of truth for a session.** In the prototype, `SCHEDULE` is a list of `[startMin, endMin, state, label]` over a 72-minute session. Derived from it — and never hardcoded — are: the ribbon segments, the trace's dip and climb, the hatched gap, the alert marker positions, the clock axis, total deep-work minutes, the `% deep` figure, "settled in", and the narrative's "longest unbroken stretch". Four independent encodings of the same session *will* drift apart; derive them.

```
[0,7,'brk'] [7,37,'deep'] [37,42,'zoned'] [42,45,'brk']
[45,55,'deep'] [55,59,'none'] [59,68,'spiral'] [68,72,'deep']
```

Alerts: `{ min: 37, kind: 'zone-out' }`, `{ min: 59, kind: 'spiral' }` — positioned as `min / total × 100%`.

---

## Voice & Content

Three principles:

1. **Observed, never diagnosed.** "Your pulse fell and your blink rate collapsed" — not "you were fatigued." Report what the camera measured and what changed after.
2. **Second person, sentence case.** No title case, no exclamation marks, no praise. A coach who is impressed with you every session isn't paying attention.
3. **Offers, not instructions.** Every intervention is refusable in one click, and refusing is never scored.

### Claim discipline (hard constraint)

Flow performs **camera-based physiological sensing**. It does not diagnose anything, it is not a medical device, and it has no FDA clearance. That sentence appears **in the connect screen and the first alert** — not buried in a footer.

**Never ship these words:** `medical grade`, `diagnosis`, `clinically`, `FDA`, `treatment`, `disorder`, `symptoms`, `prescribe`.

Add this list to lint or review. It is a product requirement, not a style preference.

---

## Assets

None. There are no images, icons or illustrations in the system — deliberately. The only graphic marks are squares, dots, rings, rules and hatch patterns, all drawn in CSS or canvas. The camera preview is a hatched placeholder and should be replaced with the real video element.

**Icon policy:** the system has no icon set. If one becomes necessary, it must be geometric and single-weight; do not introduce an illustrative icon library.

Fonts are loaded from Google Fonts (Instrument Sans, Geist Mono) — self-host them in production.

## Files

- `Flow.dc.html` — the complete prototype. Foundations (tokens, space & shape, type & naming, motion, states, charts, signal, pacer, alerts, edge states, sessions, voice), Active session, Session detail. Tokens are in the `<style>` block at the top; all component logic is in the `<script>` block at the bottom.

Open it in a browser and use the three tabs in the header. The Daylight/Evening button demonstrates the token layer re-pointing the neutrals.
