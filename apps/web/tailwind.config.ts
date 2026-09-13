import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#FBF9F5",
        ink: "#2A2723",
        muted: "#6F6B63",
        border: "#E7E2D9",
        accent: "#C4693B",
        "accent-soft": "#F1DFD3",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        serif: ["var(--font-source-serif)", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
