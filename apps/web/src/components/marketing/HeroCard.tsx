import styles from "./HeroCard.module.css";

// Static, decorative stand-in for the live pulse waveform + state ribbon
// shown on the prototype's hero card. Real canvas-driven charts (with
// live data) are built where the actual session screens are — this is
// marketing-page dressing only, not a chart component other screens reuse.
const SCHEDULE: Array<[number, number, keyof typeof SEGMENT_CLASS]> = [
  [0, 7, "brk"],
  [7, 37, "deep"],
  [37, 42, "zoned"],
  [42, 45, "brk"],
  [45, 55, "deep"],
  [55, 59, "none"],
  [59, 68, "spiral"],
  [68, 72, "deep"],
];

const SEGMENT_CLASS = {
  deep: "segDeep",
  zoned: "segZoned",
  spiral: "segSpiral",
  brk: "segBreak",
  none: "segNone",
} as const;

// A meandering line standing in for a live pulse trace — hand-placed
// points, not a data render.
const WAVE_POINTS =
  "0,72 20,68 40,74 60,58 80,66 100,40 120,52 140,30 160,44 180,60 " +
  "200,52 220,70 240,62 260,78 280,66 300,80 320,72 340,84 360,76 380,86 400,80";

export function HeroCard() {
  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <div className={styles.stateBadge}>
          <span className={styles.swatch} />
          <span className={styles.stateName}>zoned_out</span>
        </div>
        <span className={styles.meta}>live · 3m20s</span>
      </div>

      <div className={styles.headline}>
        Pulse fell six. Blinks dropped to four a minute. Your eyes never left the page.
      </div>

      <div className={styles.waveWrap}>
        <svg
          className={styles.wave}
          viewBox="0 0 400 120"
          preserveAspectRatio="none"
          role="img"
          aria-label="Illustrative pulse waveform"
        >
          <polyline
            points={WAVE_POINTS}
            fill="none"
            style={{ stroke: "var(--zoned)" }}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polygon
            points={`0,120 ${WAVE_POINTS} 400,120`}
            style={{ fill: "var(--zoned-pale)", opacity: 0.5 }}
          />
        </svg>
      </div>

      <div className={styles.ribbon}>
        {SCHEDULE.map(([start, end, kind], i) => (
          <span
            key={i}
            className={styles[SEGMENT_CLASS[kind]]}
            style={{ flex: end - start }}
          />
        ))}
      </div>
      <div className={styles.legend}>
        <span>deep_work</span>
        <span>zoned_out</span>
        <span>spiraling</span>
        <span>break</span>
        <span>no_signal</span>
      </div>
    </div>
  );
}
