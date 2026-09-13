import { Skeleton } from "@/components/ui/Skeleton";

// Mirrors the real page's single-column, stacked rule-grid-section shape
// (header block + 6 sections) so loading doesn't pop to a different layout
// once data arrives.
const SECTION_HEIGHTS = ["h-56", "h-40", "h-40", "h-48", "h-32", "h-40"];

export default function Loading() {
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", paddingTop: "var(--s5)" }}>
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-3 h-9 w-56" />
      <Skeleton className="mt-3 h-14 w-full max-w-xl" />
      {SECTION_HEIGHTS.map((h, i) => (
        <div key={i} style={{ paddingTop: "var(--s7)" }}>
          <Skeleton className={`w-full ${h}`} />
        </div>
      ))}
    </div>
  );
}
