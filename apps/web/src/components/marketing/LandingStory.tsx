"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { FaqAccordion } from "./FaqAccordion";
import { faqs, features, principles, tech } from "./content";
import styles from "./LandingStory.module.css";

const NAV_HEIGHT = 66;

const STORY_SECTIONS = [
  { id: "features", label: "Features" },
  { id: "about", label: "About" },
  { id: "tech", label: "Tech" },
  { id: "faq", label: "FAQ" },
] as const;

type PanelState = "past" | "active" | "future";

function panelState(index: number, activeIndex: number): PanelState {
  if (index < activeIndex) return "past";
  if (index > activeIndex) return "future";
  return "active";
}

export function LandingStory() {
  const storyRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [sectionProgress, setSectionProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => {
      frameRef.current = null;

      const story = storyRef.current;
      const stage = stageRef.current;
      if (!story || !stage) return;

      const rect = story.getBoundingClientRect();
      const scrollRange = Math.max(1, story.offsetHeight - stage.offsetHeight);
      const overallProgress = Math.min(1, Math.max(0, (NAV_HEIGHT - rect.top) / scrollRange));
      const scaledProgress = overallProgress * STORY_SECTIONS.length;
      const nextIndex = Math.min(STORY_SECTIONS.length - 1, Math.floor(scaledProgress));
      const nextSectionProgress =
        overallProgress === 1 ? 1 : Math.min(1, Math.max(0, scaledProgress - nextIndex));

      setActiveIndex((current) => (current === nextIndex ? current : nextIndex));
      setSectionProgress((current) =>
        Math.abs(current - nextSectionProgress) < 0.002 ? current : nextSectionProgress,
      );
      setVisible(rect.top < window.innerHeight * 0.88 && rect.bottom > NAV_HEIGHT);
    };

    const scheduleUpdate = () => {
      if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(update);
    };

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    if (storyRef.current) resizeObserver.observe(storyRef.current);
    if (stageRef.current) resizeObserver.observe(stageRef.current);

    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("orientationchange", scheduleUpdate);
    scheduleUpdate();

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      resizeObserver.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("orientationchange", scheduleUpdate);
    };
  }, []);

  return (
    <section
      ref={storyRef}
      className={styles.story}
      aria-label="Explore Flow"
      data-visible={visible}
    >
      <div className={styles.milestones} aria-hidden="true">
        {STORY_SECTIONS.map((section) => (
          <div key={section.id} className={styles.milestone}>
            <span id={section.id} className={styles.anchor} />
          </div>
        ))}
      </div>

      <div ref={stageRef} className={styles.stage}>
        <div className={styles.canvas}>
          <nav className={styles.progress} aria-label="Landing page sections">
            {STORY_SECTIONS.map((section, index) => {
              const fill = index < activeIndex ? 1 : index === activeIndex ? sectionProgress : 0;
              return (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className={styles.progressStep}
                  aria-current={index === activeIndex ? "step" : undefined}
                  style={{ "--step-progress": fill } as CSSProperties}
                >
                  <span className={styles.progressMeta}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <span>{section.label}</span>
                  </span>
                  <span className={styles.progressTrack} aria-hidden="true">
                    <span className={styles.progressFill} />
                  </span>
                </a>
              );
            })}
          </nav>

          <div className={styles.panelViewport}>
            <section
              className={styles.panel}
              data-state={panelState(0, activeIndex)}
              aria-hidden={activeIndex !== 0}
              aria-labelledby="features-title"
            >
              <div className={`${styles.panelHeading} ${styles.reveal}`}>
                <div className={styles.kicker}>What it notices</div>
                <h2 id="features-title">Features</h2>
                <p>Four things Flow does, and nothing it doesn&rsquo;t.</p>
              </div>
              <div className={`${styles.featureGrid} ${styles.reveal}`}>
                {features.map((feature) => (
                  <article key={feature.title} className={styles.featureCard}>
                    <div className={styles.featureTag}>{feature.tag}</div>
                    <h3>{feature.title}</h3>
                    <p>{feature.body}</p>
                  </article>
                ))}
              </div>
            </section>

            <section
              className={styles.panel}
              data-state={panelState(1, activeIndex)}
              aria-hidden={activeIndex !== 1}
              aria-labelledby="about-title"
            >
              <div className={`${styles.panelHeading} ${styles.reveal}`}>
                <div className={styles.kicker}>The point of view</div>
                <h2 id="about-title">About</h2>
                <p>Why it behaves the way it does.</p>
              </div>
              <div className={`${styles.aboutContent} ${styles.reveal}`}>
                <p className={styles.aboutLede}>
                  Flow is a personal instrument, not a productivity score. It reports what the
                  camera measured and leaves the judgement to you.
                </p>
                <div className={styles.principleList}>
                  {principles.map((principle) => (
                    <article key={principle.title} className={styles.principleRow}>
                      <h3>{principle.title}</h3>
                      <p>{principle.body}</p>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section
              className={styles.panel}
              data-state={panelState(2, activeIndex)}
              aria-hidden={activeIndex !== 2}
              aria-labelledby="tech-title"
            >
              <div className={`${styles.panelHeading} ${styles.reveal}`}>
                <div className={styles.kicker}>Under the surface</div>
                <h2 id="tech-title">Tech</h2>
                <p>Placeholder — swap in the real stack before launch.</p>
              </div>
              <div className={`${styles.techList} ${styles.reveal}`}>
                {tech.map((item) => (
                  <article key={item.name} className={styles.techRow}>
                    <h3>{item.name}</h3>
                    <p>{item.note}</p>
                  </article>
                ))}
                <p className={styles.techFoot}>
                  Placeholder copy. Versions, model names and latency figures to be confirmed.
                </p>
              </div>
            </section>

            <section
              className={styles.panel}
              data-state={panelState(3, activeIndex)}
              aria-hidden={activeIndex !== 3}
              aria-labelledby="faq-title"
            >
              <div className={`${styles.panelHeading} ${styles.reveal}`}>
                <div className={styles.kicker}>Before you begin</div>
                <h2 id="faq-title">FAQ</h2>
                <p>The questions people actually ask first.</p>
              </div>
              <div className={`${styles.faqWrap} ${styles.reveal}`}>
                <FaqAccordion faqs={faqs} disabled={activeIndex !== 3} />
              </div>
            </section>
          </div>

          <div className={styles.scrollCue} aria-hidden="true">
            <span>Scroll to explore</span>
            <span>
              {String(activeIndex + 1).padStart(2, "0")} / {String(STORY_SECTIONS.length).padStart(2, "0")}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.scrollSpace} aria-hidden="true">
        {STORY_SECTIONS.map((section) => (
          <div key={section.id} className={styles.scrollStep} />
        ))}
      </div>
    </section>
  );
}
