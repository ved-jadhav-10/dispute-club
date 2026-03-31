import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Dispute Club",
  description: "Historical figures debate modern topics in real-time."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
