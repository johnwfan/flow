import styles from "./HeroExperience.module.css";

const EVIDENCE = ["HR fell 6 bpm", "blink 4 /min", "gaze fixed 88%"] as const;

export function HeroExperience() {
  return (
    <figure className={styles.figure}>
      <figcaption className={styles.srOnly}>
        Flow notices a shift from focused work to drifting, explains the physiological
        evidence, and offers a quiet two-minute reset.
      </figcaption>

      <div className={styles.composition} aria-hidden="true">
        <div className={styles.surface}>
          <div className={styles.topbar}>
            <div className={styles.sessionTitle}>
              <span className={styles.liveDot} />
              <span>Active session</span>
            </div>
            <span className={styles.elapsed}>12:48</span>
          </div>

          <div className={styles.productGrid}>
            <div className={styles.mainPanel}>
              <div className={styles.stateRow}>
                <span className={styles.stateSwatch} />
                <span className={styles.machineName}>zoned_out</span>
              </div>
              <div className={styles.stateHeadline}>Drifting a little</div>
              <div className={styles.since}>for 1m 32s</div>

              <div className={styles.evidence}>
                <span className={styles.evidenceLabel}>What it saw</span>
                <div className={styles.evidenceList}>
                  {EVIDENCE.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>

              <div className={styles.plotBlock}>
                <div className={styles.plotMeta}>
                  <span>Pulse</span>
                  <span>rolling 15s</span>
                </div>
                <div className={styles.pulsePlot}>
                  <svg viewBox="0 0 560 154" preserveAspectRatio="none">
                    <path
                      className={styles.focusFill}
                      d="M0 112 C20 92 32 117 49 87 S78 107 95 71 S124 102 143 63 S174 91 192 66 S225 99 244 62 S274 91 292 76 L306 82 L306 154 L0 154 Z"
                    />
                    <path
                      className={styles.driftFill}
                      d="M306 82 C326 72 344 88 362 78 S394 91 414 83 S447 93 468 86 S501 96 522 88 S548 93 560 90 L560 154 L306 154 Z"
                    />
                    <path
                      className={`${styles.trace} ${styles.focusTrace}`}
                      pathLength="1"
                      d="M0 112 C20 92 32 117 49 87 S78 107 95 71 S124 102 143 63 S174 91 192 66 S225 99 244 62 S274 91 292 76 L306 82"
                    />
                    <path
                      className={`${styles.trace} ${styles.driftTrace}`}
                      pathLength="1"
                      d="M306 82 C326 72 344 88 362 78 S394 91 414 83 S447 93 468 86 S501 96 522 88 S548 93 560 90"
                    />
                    <circle className={styles.traceEnd} cx="560" cy="90" r="3" />
                  </svg>
                  <span className={styles.shiftMarker} />
                  <span className={styles.shiftLabel}>attention shifted</span>
                </div>
              </div>

              <div className={styles.breathBlock}>
                <div className={styles.plotMeta}>
                  <span>Breathing</span>
                  <span>11.8 /min</span>
                </div>
                <svg className={styles.breathPlot} viewBox="0 0 560 54" preserveAspectRatio="none">
                  <path
                    className={`${styles.trace} ${styles.breathTrace}`}
                    pathLength="1"
                    d="M0 29 C28 7 57 7 84 29 S139 51 168 29 S224 7 252 29 S308 51 336 29 S392 11 420 29 S476 46 504 29 S543 17 560 25"
                  />
                </svg>
              </div>

              <div className={styles.timeline}>
                <span className={styles.deepSegment} style={{ flex: 7 }} />
                <span className={styles.zonedSegment} style={{ flex: 2 }} />
                <span className={styles.breakSegment} style={{ flex: 1 }} />
                <span className={styles.deepSegment} style={{ flex: 4 }} />
              </div>
              <div className={styles.timelineMeta}>
                <span>12:36</span>
                <span>now</span>
              </div>
            </div>

            <aside className={styles.readingRail}>
              <span className={styles.railLabel}>Right now</span>
              <div className={styles.heroReading}>
                <span>55</span>
                <small>bpm</small>
              </div>
              <svg className={styles.sparkline} viewBox="0 0 120 28" preserveAspectRatio="none">
                <path d="M0 8 C18 10 28 12 40 14 S63 19 76 18 S99 22 120 21" />
              </svg>
              <span className={styles.trend}>−6.1 recently</span>

              <div className={styles.metrics}>
                <div>
                  <span>Variability</span>
                  <strong>92 ms</strong>
                </div>
                <div>
                  <span>Breathing</span>
                  <strong>11.8</strong>
                </div>
                <div>
                  <span>Blinks</span>
                  <strong>quiet</strong>
                </div>
              </div>

              <div className={styles.confidence}>
                <div className={styles.confidenceHeading}>
                  <span>Signal</span>
                  <strong>0.86</strong>
                </div>
                <div className={styles.confidenceTrack}>
                  <span className={styles.confidenceTick} />
                  <span className={styles.confidenceFill} />
                </div>
              </div>
            </aside>
          </div>
        </div>

        <div className={styles.intervention}>
          <div className={styles.interventionMeta}>
            <span>zoned_out</span>
            <span>soft chime</span>
          </div>
          <div className={styles.interventionTitle}>Still with it?</div>
          <p>Your pulse eased and your gaze stopped moving. A short reset may help.</p>
          <div className={styles.interventionActions}>
            <span className={styles.resetAction}>2-min reset</span>
            <span className={styles.dismissAction}>Not now</span>
          </div>
        </div>
      </div>
    </figure>
  );
}
