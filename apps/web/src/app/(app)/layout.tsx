import { Sidebar } from "@/components/layout/Sidebar";
import styles from "./layout.module.css";

// Shared shell for every screen inside the app (Session, Sessions/dashboard,
// Insights, Break): a persistent left sidebar plus a
// max-width, centred content column. This wraps the existing pages as-is —
// their content/logic is untouched here.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
