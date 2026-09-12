import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Flow — Smart Focus Tracking",
  description: "Real-time focus state detection and study analytics",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
