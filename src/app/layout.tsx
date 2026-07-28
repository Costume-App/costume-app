import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { CLERK_LOCALIZATION } from "@/lib/clerk-localization";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["400", "500", "600", "700"],
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Measure My Costume",
  description: "Plan costumes, casts, and fabric for your production.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider localization={CLERK_LOCALIZATION}>
      <html lang="en" className={`${fraunces.variable} ${hanken.variable}`}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
