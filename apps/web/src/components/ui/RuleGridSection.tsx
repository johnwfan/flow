import type { CSSProperties, ReactNode } from "react";
import styles from "./RuleGridSection.module.css";

/**
 * The Flow design system's section layout: a 210px label column (heading +
 * one-sentence description) and a content column, with the inset rule-grid
 * border. See "Design Pages/uploads/.../README.md" § Layout system.
 */
export function RuleGridSection({
  title,
  description,
  children,
  style,
}: {
  title: string;
  description: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className={styles.section} style={style}>
      <span className={styles.ruleL} aria-hidden />
      <span className={styles.ruleR} aria-hidden />
      <span className={styles.ruleV} aria-hidden />
      <span className={styles.cross} aria-hidden>
        <span className={styles.crossH} />
        <span className={styles.crossV} />
      </span>
      <div>
        <div className={styles.title}>{title}</div>
        <div className={styles.desc}>{description}</div>
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
