"use client";

import { useState } from "react";
import styles from "./FaqAccordion.module.css";

export function FaqAccordion({ faqs }: { faqs: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number>(-1);

  return (
    <div>
      {faqs.map((item, i) => {
        const isOpen = open === i;
        return (
          <button
            key={item.q}
            className={styles.item}
            aria-expanded={isOpen}
            onClick={() => setOpen((prev) => (prev === i ? -1 : i))}
          >
            <div className={styles.row}>
              <span className={styles.question}>{item.q}</span>
              <span className={styles.sign}>{isOpen ? "−" : "+"}</span>
            </div>
            {isOpen && <div className={styles.answer}>{item.a}</div>}
          </button>
        );
      })}
      <div className={styles.closingRule} />
    </div>
  );
}
