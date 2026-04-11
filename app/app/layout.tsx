import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, DM_Sans, DM_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/providers/QueryProvider";

// Barlow Condensed: high-visibility display type (transit/signage DNA)
// DM Sans: clean body font with personality — reads great large and small
// DM Mono: studio-readout feel for timers and technical values

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["700", "800", "900"],
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  variable: "--font-code",
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Odio",
  description: "Jam. Cut. Keep.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // prevent iOS auto-zoom on input focus
  themeColor: "#080808",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`h-full ${barlowCondensed.variable} ${dmSans.variable} ${dmMono.variable}`}
      style={{ colorScheme: "dark" }}
    >
      <body className="min-h-full flex flex-col">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
