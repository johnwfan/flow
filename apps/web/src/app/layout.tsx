import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import { GeistMono } from "geist/font/mono";

import "./globals.css";

// Instrument Sans is self-hosted via next/font/google (no runtime Google
// Fonts <link>, no layout shift). Geist Mono isn't in next/font/google's
// catalog (it's Vercel's own font, not a Google Font) — the official
// `geist` package self-hosts it the same way, backed by next/font/local.
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-instrument-sans",
});

export const metadata: Metadata = {
  title: "Flow",
  description:
    "Flow reads pulse, breathing, blink rate and gaze off a plain webcam and names the state nothing else measures — eyes on the page, brain gone.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${instrumentSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
