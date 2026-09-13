import type { ReactNode } from "react";
import { getInsights } from "@/lib/api";
import { FocusWindowChart } from "@/components/insights/FocusWindowChart";
import { DaypartFocusChart } from "@/components/insights/DaypartFocusChart";
import { CategoryEffortChart } from "@/components/insights/CategoryEffortChart";
import { DistractionPatternChart } from "@/components/insights/DistractionPatternChart";
import { SettleTrendChart } from "@/components/insights/SettleTrendChart";
import { BreaksAndInterventions } from "@/components/insights/BreaksAndInterventions";
import { buildInsightTakeaways } from "@/components/insights/presentation";
import { ConfusionMatrix } from "@/components/validation/ConfusionMatrix";
import { formatDuration, formatPercent } from "@/lib/format";
import { sessionCount } from "@/lib/patterns";
import styles from "./insights.module.css";

function limits(checkIns: number): string[] {
  return [
    "Flow performs camera-based physiological sensing. It is not a medical device, it diagnoses nothing, and it has no clearance of any kind.",
    "Self-report is the only ground truth here, and self-report is imperfect — you may not notice you had drifted until you are asked.",
    "Signal quality drives everything. Below 0.55 confidence Flow keeps reading but stops interrupting, and those windows are excluded from this table.",
    `A single user, a single machine, ${checkIns} check-in${checkIns === 1 ? "" : "s"}. This is evidence that the classifier tracks something real for you — not a population result.`,
  ];
}

function InsightCard({
  id,
  number,
  title,
  description,
  className,
  children,
}: {
  id: string;
  number: string;
  title: string;
  description: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <article id={id} className={`${styles.card} ${className}`}>
      <header className={styles.cardHeader}>
        <span className={styles.cardNumber}>{number}</span>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </header>
      <div className={styles.cardContent}>{children}</div>
    </article>
  );
}

export default async function InsightsPage() {
  const insights = await getInsights();
  const sessions = sessionCount(insights);
  const trackedMinutes = insights.effortByCategory.reduce((sum, category) => sum + category.minutes, 0);
  const takeaways = buildInsightTakeaways(insights, sessions);
  const { validation } = insights;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.meta}>
          Across {sessions} session{sessions === 1 ? "" : "s"}
          {trackedMinutes > 0 ? ` · ${formatDuration(trackedMinutes * 60)} tracked` : ""}
        </div>
        <div className={styles.headingGrid}>
          <h1>Patterns</h1>
          <p>
            What holds across sessions, not what happened in one. Nothing here is drawn until
            there&rsquo;s enough signal behind it.
          </p>
        </div>
      </header>

      <section className={styles.digest} aria-labelledby="digest-title">
        <div className={styles.digestIntro}>
          <div className={styles.digestEyebrow}>Written for you</div>
          <h2 id="digest-title">What your sessions are starting to say.</h2>
          <p>A plain-language reading of the patterns below. Each note links to its evidence.</p>
        </div>
        <div className={styles.digestList}>
          {takeaways.map((takeaway, index) => (
            <a key={takeaway.id} href={`#${takeaway.id}`} className={styles.digestItem}>
              <span className={styles.digestIndex}>{String(index + 1).padStart(2, "0")}</span>
              <span>
                <span className={styles.digestLabel}>{takeaway.label}</span>
                <span className={styles.digestText}>{takeaway.text}</span>
              </span>
              <span className={styles.digestArrow} aria-hidden="true">
                ↘
              </span>
            </a>
          ))}
        </div>
      </section>

      <section className={styles.evidence} aria-labelledby="evidence-title">
        <div className={styles.sectionHeading}>
          <div className={styles.sectionEyebrow}>The evidence</div>
          <h2 id="evidence-title">The shape behind the summary.</h2>
          <p>Read the signals individually, or follow a note above directly to its source.</p>
        </div>

        <div className={styles.cardGrid}>
          <InsightCard
            id="focus-window"
            number="01"
            title="Focus window"
            description="How long deep work survives before the first drift."
            className={styles.cardWide}
          >
            <FocusWindowChart data={insights.focusWindow} sessionCount={sessions} />
          </InsightCard>

          <InsightCard
            id="focus-by-time"
            number="02"
            title="Focus by time of day"
            description="When focus tends to hold up, and when it doesn't."
            className={styles.cardNarrow}
          >
            <DaypartFocusChart data={insights.focusByTime} sessionCount={sessions} />
          </InsightCard>

          <InsightCard
            id="effort-by-app"
            number="03"
            title="Effort by app"
            description="Where the deep-work minutes actually went."
            className={styles.cardHalf}
          >
            <CategoryEffortChart data={insights.effortByCategory} sessionCount={sessions} />
          </InsightCard>

          <InsightCard
            id="refocus-cost"
            number="04"
            title="Re-focus cost by app"
            description="The price of a single check, ranked by how long it takes to get back to deep work."
            className={styles.cardHalf}
          >
            <DistractionPatternChart data={insights.distractionPatterns} sessionCount={sessions} />
          </InsightCard>

          <InsightCard
            id="time-to-settle"
            number="05"
            title="Time to settle"
            description="Minutes from session start to the first stable deep-work stretch."
            className={styles.cardNarrow}
          >
            <SettleTrendChart data={insights.settleTrend} sessionCount={sessions} />
          </InsightCard>

          <InsightCard
            id="breaks-and-interventions"
            number="06"
            title="Breaks & interventions"
            description="Which breaks restored you, and whether the breathing loop moved anything."
            className={styles.cardWide}
          >
            <BreaksAndInterventions
              breakQuality={insights.breakQuality}
              interventionEfficacy={insights.interventionEfficacy}
            />
          </InsightCard>
        </div>
      </section>

      <section id="validation" className={styles.validation} aria-labelledby="validation-title">
        <div className={styles.validationHeader}>
          <div>
            <div className={styles.sectionEyebrow}>Trust the reading</div>
            <h2 id="validation-title">Does it actually know?</h2>
          </div>
          <p>
            Every check-in is scored against what the classifier predicted at that exact
            timestamp—including where it was wrong.
          </p>
        </div>

        <div className={styles.validationStats}>
          <div>
            <span>Check-ins</span>
            <strong>n = {validation.n}</strong>
            <small>{validation.n} answered</small>
          </div>
          <div>
            <span>Agreement</span>
            <strong>{formatPercent(validation.agreementRate)}</strong>
            <small>matched your self-report</small>
          </div>
          <div>
            <span>False alarms</span>
            <strong>{formatPercent(validation.falseAlarmRate)}</strong>
            <small>called drifting, you were fine</small>
          </div>
        </div>

        <details className={styles.proof}>
          <summary>
            <span>
              <strong>See the evidence and limitations</strong>
              <small>Prediction vs. self-report, plus what these numbers do and do not mean.</small>
            </span>
            <span className={styles.proofIcon} aria-hidden="true" />
          </summary>
          <div className={styles.proofBody}>
            <div>
              <div className={styles.proofHeading}>
                <h3>Prediction vs. self-report</h3>
                <p>Rows are what the classifier said. Columns are what you said.</p>
              </div>
              <div className={styles.matrixScroll}>
                <ConfusionMatrix data={validation} showStats={false} />
              </div>
            </div>
            <div className={styles.limitations}>
              <h3>What this isn&rsquo;t</h3>
              {limits(validation.n).map((text, index) => (
                <p key={index}>{text}</p>
              ))}
            </div>
          </div>
        </details>
      </section>
    </div>
  );
}
