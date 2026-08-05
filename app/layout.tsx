import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://tembolic-compliance-auditor.mullykim428477.chatgpt.site"),
  title: "Phyniqs Global Web Crawler",
  description: "Live website crawling and typography intelligence by Phyniqs.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "Phyniqs Global Web Crawler",
    description: "See every font. Miss nothing.",
    images: [{ url: "/phyniqs-logo.jpg", width: 1280, height: 720, alt: "Phyniqs" }],
  },
  twitter: { card: "summary_large_image", title: "Phyniqs Global Web Crawler", description: "See every font. Miss nothing.", images: ["/phyniqs-logo.jpg"] },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
