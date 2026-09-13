import Link from "next/link";
import { HeroExperience } from "@/components/marketing/HeroExperience";
import { LandingStory } from "@/components/marketing/LandingStory";
import styles from "./page.module.css";

export default function LandingPage() {
  return (
    <div>
      <div className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1 className={styles.h1}>
            <span className={styles.headlineLine}>Eyes on the page,</span>
            <span className={`${styles.headlineLine} ${styles.brainGone}`}>brain gone.</span>
          </h1>
          <p className={styles.lede}>
            Flow is a focus app that watches your pulse, breathing, blinks and gaze
            through a plain webcam, catching drift in the moment and turning every
            session into insights on when and why your focus slips.
          </p>
          <div className={styles.ctaRow}>
            <Link href="/session" className={styles.primaryCta}>
              Enter Flow <span aria-hidden="true">&rarr;</span>
            </Link>
            <Link href="/insights#validation" className={styles.secondaryCta}>
              See if it actually works <span className={styles.secondaryArrow} aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </div>

        <HeroExperience />
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
