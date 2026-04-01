import * as React from "react";
import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Hortus",
  description: "Your files, safely stored in B2.",
};

const outfit = Outfit({
  variable: "--font-outfit",
  display: "swap",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${outfit.className} antialiased`}>
        <ThemeProvider>
          <React.Suspense fallback={<div className="h-screen w-full flex items-center justify-center"><span className="loading loading-rings loading-lg"></span></div>}>
            {children}
          </React.Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
