import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PlatformFeedback } from "@/components/platform-feedback";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.beyondthestops.com"),
  title: {
    default: "Beyond the Stops",
    template: "%s · Beyond the Stops",
  },
  description:
    "Discover the stories, places and people you're passing as you travel by bus, tram or train.",
  applicationName: "Beyond the Stops",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}<PlatformFeedback /></body>
    </html>
  );
}
