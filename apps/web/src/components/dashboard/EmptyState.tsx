export function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-white/50 px-6 py-16 text-center">
      <h2 className="text-lg font-semibold text-ink">No sessions yet</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
        Flow watches your focus in the background and helps you notice when you drift. Start the
        agent to begin your first tracked session — it&apos;ll show up here as soon as it ends.
      </p>
    </div>
  );
}
