import type { Metadata } from "next";
import { Silkscreen } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const pixelFont = Silkscreen({
  weight: ["400"],
  subsets: ["latin"],
  variable: "--font-pixel",
});

export const metadata: Metadata = {
  title: "百业播报",
  description: "燕云十六声百业团战像素风指挥辅助工具",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={cn(
          "min-h-screen bg-neutral-900 text-neutral-100 antialiased font-pixel",
          pixelFont.variable
        )}
      >
        {children}
      </body>
    </html>
  );
}
