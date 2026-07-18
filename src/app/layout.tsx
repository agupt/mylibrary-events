import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://mylibrary-events.com"),
  title: {
    default: "Library Storytime — free kids' events at your local library",
    template: "%s | Library Storytime",
  },
  description:
    "Find storytimes, crafts, and STEM events for kids at US public libraries. Search by city or zip code — live calendars from 1,700+ branches.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Library Storytime",
    url: "/",
    title: "Library Storytime — free kids' events at your local library",
    description:
      "Find storytimes, crafts, and STEM events for kids at US public libraries.",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-gradient-to-b from-violet-50 via-white to-amber-50/40 text-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
