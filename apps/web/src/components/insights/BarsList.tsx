// Chart type 3 from the design system, "Bars": a label column, a pill track
// filled proportionally in an app-category (indigo-tint) colour, and a
// tabular value -- used for both "Effort by app" and the cross-session
// distraction pattern module.
export interface BarsListItem {
  label: string;
  value: string;
  pct: number; // 0-100 fill width
  colorVar: string; // e.g. "--cat-1"
}

export function BarsList({ items }: { items: BarsListItem[] }) {
  return (
    <div>
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(80px, 140px) minmax(0, 1fr) 72px",
            gap: "var(--s3)",
            alignItems: "center",
            padding: "10px 0",
          }}
        >
          <span
            style={{
              fontSize: 15,
              color: "var(--body)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={item.label}
          >
            {item.label}
          </span>
          <span
            style={{
              height: 10,
              borderRadius: "var(--r-pill)",
              background: "var(--sink)",
              display: "block",
              overflow: "hidden",
            }}
          >
            <span
              style={{
                display: "block",
                height: "100%",
                width: `${item.pct}%`,
                borderRadius: "var(--r-pill)",
                background: `var(${item.colorVar})`,
              }}
            />
          </span>
          <span style={{ textAlign: "right", fontSize: 15, fontVariantNumeric: "tabular-nums" }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export const CAT_VARS = ["--cat-1", "--cat-2", "--cat-3", "--cat-4"] as const;
