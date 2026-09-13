import { MarketingNav } from "@/components/marketing/MarketingNav";
import styles from "./layout.module.css";

// The marketing shell (landing page at "/"): a sticky top nav instead of
// the app's persistent sidebar. Only the landing page lives in this route
// group today.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MarketingNav />
      <main className={styles.main}>{children}</main>
    </>
  );
}
