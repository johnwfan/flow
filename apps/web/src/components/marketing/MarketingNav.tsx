import Link from "next/link";
import styles from "./MarketingNav.module.css";

const SECTION_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#about", label: "About" },
  { href: "#tech", label: "Tech" },
  { href: "#faq", label: "FAQ" },
] as const;

export function MarketingNav() {
  return (
    <div className={styles.bar}>
      <div className={styles.inner}>
        <Link href="/" className={styles.mark}>
          <span className={styles.markLabel}>Flow</span>
        </Link>

        <nav className={styles.nav}>
          {SECTION_LINKS.map((link) => (
            <a key={link.href} href={link.href} className={styles.navLink}>
              <span className={styles.navClip}>
                <span className={styles.navLabel} data-label={link.label}>
                  {link.label}
                </span>
              </span>
            </a>
          ))}
        </nav>

        <div className={styles.right}>
          <Link href="/session" className={styles.cta}>
            Enter Flow
          </Link>
        </div>
      </div>
    </div>
  );
}
