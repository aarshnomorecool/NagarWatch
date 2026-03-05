import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "mapbox-gl/dist/mapbox-gl.css";
import { Navbar } from "@/components/ui/navbar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CivicSync",
  description: "Civic issue reporting and monitoring platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen">
          <Navbar />
          <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pr-28">{children}</main>
        </div>
      </body>
    </html>
  );
}