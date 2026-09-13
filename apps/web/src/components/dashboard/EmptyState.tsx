import Link from "next/link";

/** The "Empty history" edge state — design README "Edge states". */
export function EmptyState() {
  return (
    <div style={{ paddingTop: "var(--s7)", maxWidth: "58ch" }}>
      <h2 style={{ margin: 0, fontSize: 23, fontWeight: 500, letterSpacing: "-0.04em" }}>No sessions yet</h2>
      <p style={{ margin: "var(--s3) 0 0", fontSize: 15, lineHeight: 1.55, color: "var(--body)" }}>
        Flow takes four minutes of you being normal before it says anything — that's your baseline, not a loading
        screen. Every frame is processed locally and never leaves this machine.
      </p>
      <Link
        href="/session"
        style={{
          display: "inline-block",
          marginTop: "var(--s5)",
          padding: "11px 20px",
          borderRadius: "var(--r-pill)",
          background: "var(--indigo)",
          color: "oklch(1 0 0)",
          fontSize: 13.5,
          fontWeight: 500,
        }}
      >
        Start a session
      </Link>
    </div>
  );
}
