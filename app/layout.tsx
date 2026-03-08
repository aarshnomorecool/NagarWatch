import type { Metadata } from "next";
import { Merriweather, Roboto, Space_Grotesk } from "next/font/google";
import "./globals.css";
import "mapbox-gl/dist/mapbox-gl.css";
import { Navbar } from "@/components/ui/navbar";

const merriweather = Merriweather({
  subsets: ["latin"],
  weight: ["300", "400", "700", "900"],
  variable: "--font-logo",
});

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-body",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "NagarWatch",
  description: "Civic issue reporting and monitoring platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${roboto.variable} ${merriweather.variable} ${spaceGrotesk.variable}`}>
        <div className="min-h-screen">
          <Navbar />
          <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pr-28">{children}</main>
        </div>
      </body>
    </html>
  );
}