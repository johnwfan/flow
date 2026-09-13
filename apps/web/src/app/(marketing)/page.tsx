import Link from "next/link";
import { Section } from "@/components/marketing/Section";
import { HeroCard } from "@/components/marketing/HeroCard";
import { FaqAccordion } from "@/components/marketing/FaqAccordion";
import { heroStats, features, principles, tech, faqs } from "@/components/marketing/content";
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

      <Section id="features" title="Features" description="Four things Flow does, and nothing it doesn't.">
        <div className={styles.featureGrid}>
          {features.map((f) => (
            <div key={f.title}>
              <div className={styles.featureTag}>{f.tag}</div>
              <div className={styles.featureTitle}>{f.title}</div>
              <div className={styles.featureBody}>{f.body}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="about" title="About" description="Why it behaves the way it does.">
        <div>
          <div className={styles.aboutLede}>
            Flow is a personal instrument, not a productivity score. It reports what the
            camera measured and leaves the judgement to you.
          </div>
          <div className={styles.principleList}>
            {principles.map((p) => (
              <div key={p.title} className={styles.principleRow}>
                <span className={styles.principleTitle}>{p.title}</span>
                <span className={styles.principleBody}>{p.body}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section id="tech" title="Tech" description="Placeholder — swap in the real stack before launch.">
        <div>
          {tech.map((t) => (
            <div key={t.name} className={styles.techRow}>
              <span className={styles.techName}>{t.name}</span>
              <span className={styles.techNote}>{t.note}</span>
            </div>
          ))}
          <div className={styles.techFoot}>
            Placeholder copy. Versions, model names and latency figures to be confirmed.
          </div>
        </div>
      </Section>

      <Section id="faq" title="FAQ" description="The questions people actually ask first.">
        <FaqAccordion faqs={faqs} />
      </Section>

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
