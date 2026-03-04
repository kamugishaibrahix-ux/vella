import type { Metadata, Viewport } from "next";
import { Inter, Lora, EB_Garamond, DM_Sans } from "next/font/google";
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

const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-garamond",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vella — Your Life's Compass",
  description: "Your Life's Compass",
  icons: {
    icon: "/icons/icon-192.png",
    shortcut: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
  openGraph: {
    images: ["/icons/icon-512.png"],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/icons/icon-512.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Vella",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f5f4",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${lora.variable} ${ebGaramond.variable} ${dmSans.variable}`}>
      <body className="min-h-screen font-sans text-vella-text bg-vella-bg flex justify-center">
        {/* Single width controller: no max-width wrappers inside pages */}
        <div className="w-full max-w-md md:max-w-lg h-full relative">
          <MobileShell>{children}</MobileShell>
        </div>
      </body>
    </html>
  );
}
