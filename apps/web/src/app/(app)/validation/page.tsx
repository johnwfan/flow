import { getInsights } from "@/lib/api";
import { Section } from "@/components/marketing/Section";
import { ConfusionMatrix } from "@/components/validation/ConfusionMatrix";
import { sessionCount } from "@/lib/patterns";

// Claim-discipline copy (design README, "Claim discipline (hard constraint)"):
// copied verbatim except the check-in count, which is real. Never ship
// "medical grade", "diagnosis", "clinically", "FDA", "treatment", "disorder",
// "symptoms" or "prescribe" anywhere near this page.
function limits(n: number): string[] {
  return [
    "Flow performs camera-based physiological sensing. It is not a medical device, it diagnoses nothing, and it has no clearance of any kind.",
    "Self-report is the only ground truth here, and self-report is imperfect — you may not notice you had drifted until you are asked.",
    "Signal quality drives everything. Below 0.55 confidence Flow keeps reading but stops interrupting, and those windows are excluded from this table.",
    `A single user, a single machine, ${n} check-in${n === 1 ? "" : "s"}. This is evidence that the classifier tracks something real for you — not a population result.`,
  ];
}

export default async function ValidationPage() {
  const insights = await getInsights();
  const sessions = sessionCount(insights);
  const { validation } = insights;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", paddingTop: "var(--s5)" }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mute)", marginBottom: 10 }}>
        n = {validation.n} check-in{validation.n === 1 ? "" : "s"} · {sessions} session{sessions === 1 ? "" : "s"}
      </div>
      <h1 style={{ margin: 0, fontSize: 36, fontWeight: 500, letterSpacing: "-0.045em" }}>Does it actually know?</h1>
      <p style={{ margin: "var(--s3) 0 0", fontSize: 18, lineHeight: 1.55, color: "var(--body)", maxWidth: "62ch" }}>
        Every check-in you answer is scored against what the classifier predicted at that exact timestamp. Here is
        the whole record, including where it was wrong.
      </p>

      <Section title="Prediction vs. self-report" description="Rows are what the classifier said. Columns are what you said.">
        <ConfusionMatrix data={validation} />
      </Section>

      <Section title="What this isn't" description="Stated plainly, in the same place as the numbers.">
        <div>
          {limits(validation.n).map((text, i) => (
            <div
              key={i}
              style={{
                padding: "var(--s4) 0",
                borderTop: "1px solid var(--line-soft)",
                fontSize: 15,
                lineHeight: 1.55,
                color: "var(--body)",
                maxWidth: "68ch",
              }}
            >
              {text}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
