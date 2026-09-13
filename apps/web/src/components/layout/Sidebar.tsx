"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Sidebar.module.css";

// Route the sidebar nav points at vs. what it's labelled. "Sessions" keeps
// the existing `/dashboard` URL rather than renaming the route — noted
// here so it isn't mistaken for a bug later.
const NAV_ITEMS = [
  { href: "/session", label: "Tracker" },
  { href: "/dashboard", label: "Sessions" },
  { href: "/insights", label: "Insights" },
  { href: "/validation", label: "Validation" },
] as const;

const HISTORY_STATUS = "Past sessions";

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    // "Sessions" is current for both the list and any session detail page.
    return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname() ?? "";

  return (
    <aside className={styles.side}>
      <Link href="/" className={styles.mark}>
        <span className={styles.markLabel}>Flow</span>
      </Link>

      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={active ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className={styles.footer}>
        <div className={styles.rule} />
        <div className={styles.statusRow}>
          <span className={styles.statusDot} />
          <span className={styles.statusText}>{HISTORY_STATUS}</span>
        </div>
        <div className={styles.supportLine}>
          Frames stay on this machine. Camera-based physiological sensing.
        </div>
        <Link href="/session" className={styles.startBtn}>
          Start tracker
        </Link>
      </div>
    </aside>
  );
}
