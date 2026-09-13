import type { ReactNode } from "react";
import styles from "./Section.module.css";

// The rule-grid section device from the design system: a 210px label
// column (heading + one-sentence description) beside a content column,
// with a top rule that breaks for a small tick-cross where the vertical
// column rule meets it. Used for every landing-page section.
export function Section({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.section}>
      <div className={styles.ruleL} />
      <div className={styles.ruleR} />
      <div className={styles.ruleV} />
      <div className={styles.cross}>
        <div className={styles.crossH} />
        <div className={styles.crossV} />
      </div>
      <div id={id} className={styles.label}>
        <div className={styles.title}>{title}</div>
        <div className={styles.description}>{description}</div>
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
