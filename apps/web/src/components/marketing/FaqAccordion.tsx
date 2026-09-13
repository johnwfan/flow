"use client";

import { useId, useState } from "react";
import styles from "./FaqAccordion.module.css";

export function FaqAccordion({
  faqs,
  disabled = false,
}: {
  faqs: { q: string; a: string }[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState<number>(-1);
  const accordionId = useId();

  return (
    <div>
      {faqs.map((item, i) => {
        const isOpen = open === i;
        const questionId = `${accordionId}-question-${i}`;
        const answerId = `${accordionId}-answer-${i}`;
        return (
          <div key={item.q} className={styles.item}>
            <button
              className={styles.trigger}
              aria-expanded={isOpen}
              aria-controls={answerId}
              disabled={disabled}
              onClick={() => setOpen((prev) => (prev === i ? -1 : i))}
            >
              <span className={styles.row}>
                <span id={questionId} className={styles.question}>
                  {item.q}
                </span>
                <span className={styles.sign} data-open={isOpen} aria-hidden="true" />
              </span>
            </button>
            <span
              id={answerId}
              className={styles.answerReveal}
              data-open={isOpen}
              aria-hidden={!isOpen}
              role="region"
              aria-labelledby={questionId}
            >
              <span className={styles.answerClip}>
                <span className={styles.answer}>{item.a}</span>
              </span>
            </span>
          </div>
        );
      })}
      <div className={styles.closingRule} />
    </div>
  );
}
