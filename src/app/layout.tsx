import type { Metadata } from "next";
import { Silkscreen } from "next/font/google";
import PrivyClientProvider from "@/components/PrivyClientProvider";
import "./globals.css";

const silkscreen = Silkscreen({
  variable: "--font-silkscreen",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HEIST",
  description: "Cross the traffic, beat the police, keep the ticket.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${silkscreen.variable} antialiased`}>
        <PrivyClientProvider>{children}</PrivyClientProvider>
      </body>
    </html>
  );
}
