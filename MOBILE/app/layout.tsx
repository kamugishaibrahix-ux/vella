import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import "@/lib/security/logGuard"; // DO NOT REMOVE: Privacy enforcement layer
import "@/app/globals.css";
import { MobileShell } from "@/app/components/MobileShell";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vella",
  description: "Emotionally intelligent companion",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${lora.variable}`}>
      <body className="min-h-screen font-sans text-vella-text bg-vella-bg flex justify-center">
        {/* Single width controller: no max-width wrappers inside pages */}
        <div className="w-full max-w-md md:max-w-lg min-h-screen relative">
          <MobileShell>{children}</MobileShell>
        </div>
      </body>
    </html>
  );
}
