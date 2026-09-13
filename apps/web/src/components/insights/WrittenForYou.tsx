// The recurring "written for you" takeaway line under every pattern module --
// a mono eyebrow label plus a sentence templated from the module's own real
// numbers (never an invented field, never an LLM call for this page).
export function WrittenForYou({ text }: { text: string }) {
  return (
    <div style={{ marginTop: "var(--s5)", paddingTop: "var(--s4)", borderTop: "1px solid var(--line-soft)" }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mute)" }}>written for you</div>
      <div style={{ marginTop: 8, fontSize: 15, lineHeight: 1.55, color: "var(--ink)", maxWidth: "62ch" }}>{text}</div>
    </div>
  );
}
