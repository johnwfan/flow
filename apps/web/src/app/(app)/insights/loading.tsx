import { Skeleton } from "@/components/ui/Skeleton";
import styles from "./insights.module.css";

const CARD_SIZES = [styles.cardWide, styles.cardNarrow, styles.cardHalf, styles.cardHalf, styles.cardNarrow, styles.cardWide];

export default function Loading() {
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-3 h-14 w-full max-w-3xl" />
      </div>

      <Skeleton className="h-96 w-full rounded-3xl" />

      <div className={styles.evidence}>
        <Skeleton className="mb-6 h-16 w-full max-w-2xl" />
        <div className={styles.cardGrid}>
          {CARD_SIZES.map((size, index) => (
            <div key={index} className={`${styles.card} ${size}`}>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="mt-6 h-44 w-full" />
            </div>
          ))}
        </div>
      </div>

      <Skeleton className="mt-24 h-72 w-full rounded-3xl" />
    </div>
  );
}
