import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Explore journeys",
  description:
    "Discover location-aware audio tours for bus and tram journeys through Edinburgh.",
  alternates: { canonical: "/tours" },
};

export default function ToursLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
