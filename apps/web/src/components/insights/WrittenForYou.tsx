// The recurring "written for you" takeaway line under every pattern module --
// a mono eyebrow label plus a sentence templated from the module's own real
// numbers (never an invented field, never an LLM call for this page).
export function WrittenForYou({ text }: { text: string }) {
  return (
    <div style={{ marginTop: "var(--s6)", paddingTop: "var(--s4)", borderTop: "2px solid var(--deep)" }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, fontWeight: 500, color: "var(--deep-ink)" }}>
        written for you
      </div>
      <div style={{ marginTop: 8, fontSize: 16, lineHeight: 1.6, color: "var(--ink)", maxWidth: "62ch" }}>{text}</div>
    </div>
  );
}
