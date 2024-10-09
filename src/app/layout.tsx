import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const interFont = localFont({
  src: "./fonts/Inter.ttf",
  variable: "--font-inter",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Cook the Book",
  description: "Autonomous AI accounting preparation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${interFont.variable} antialiased flex flex-col items-center justify-center min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}
