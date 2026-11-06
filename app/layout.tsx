import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "1City",
  description: "One chat for every City Hall service",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
