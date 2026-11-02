import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-jb", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Compliance Intelligence | EY", template: "%s · Compliance Intelligence | EY" },
  description: "Framework repository, regulatory obligation traceability, CCF mapping and framework update monitoring. Prepared by EY.",
  applicationName: "Compliance Intelligence",
  authors: [{ name: "EY" }],
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${mono.variable}`}>
      <body className="font-sans text-[13px]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
