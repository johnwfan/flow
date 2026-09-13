import Link from "next/link";
import { HeroCard } from "@/components/marketing/HeroCard";
import { LandingStory } from "@/components/marketing/LandingStory";
import { heroStats } from "@/components/marketing/content";
import styles from "./page.module.css";

export default function LandingPage() {
  return (
    <div>
      <div className={styles.hero}>
        <div>
          <div className={styles.badge}>
            <span className={styles.badgeDot} />
            <span className={styles.badgeText}>Runs locally · camera-based sensing</span>
          </div>
          <h1 className={styles.h1}>Eyes on the page, brain gone.</h1>
          <p className={styles.lede}>
            Flow reads your pulse, breathing, blinks and gaze off a plain webcam, checks it
            against what&rsquo;s actually on your screen, and catches the state no timer can
            see — still looking, no longer there.
          </p>
          <div className={styles.ctaRow}>
            <Link href="/session" className={styles.primaryCta}>
              Enter Flow <span aria-hidden="true">&rarr;</span>
            </Link>
            <Link href="/validation" className={styles.secondaryCta}>
              See if it actually works
            </Link>
          </div>
          <div className={styles.statsRow}>
            {heroStats.map((s) => (
              <div key={s.label}>
                <div className={styles.statValue}>{s.value}</div>
                <div className={styles.statLabel}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <HeroCard />
      </div>

      <LandingStory />

      <div className={styles.closing}>
        <div>
          <div className={styles.closingTitle}>
            Four minutes to a baseline. Then it just watches.
          </div>
          <div className={styles.closingBody}>
            No account needed, and your camera frames never leave this machine. Camera-based
            physiological sensing — not a medical device, and it diagnoses nothing.
          </div>
        </div>
        <Link href="/session" className={styles.closingCta}>
          Enter Flow <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
    </div>
  );
}
