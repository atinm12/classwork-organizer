import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Classwork Organizer",
  description:
    "Live view of upcoming assignments and tests from Canvas and CMU course schedules.",
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
