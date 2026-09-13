import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Legacy Tailwind colour names kept so components not yet migrated
        // to the new design system (dashboard/session/insights/validation
        // content — other agents' work) still resolve to *one* palette
        // instead of the old cream/ink theme diverging from the new tokens.
        cream: "var(--paper)",
        ink: "var(--ink)",
        muted: "var(--mute)",
        border: "var(--line)",
        accent: "var(--indigo)",
        "accent-soft": "var(--sink)",
      },
      fontFamily: {
        // No serif anywhere in the new system — "serif" is mapped to the
        // sans family so any leftover font-serif usage doesn't render an
        // actual serif face.
        sans: ["var(--font-instrument-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-instrument-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
