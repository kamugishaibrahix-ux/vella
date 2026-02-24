import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../styles/globals.css";
import dynamic from "next/dynamic";
import { AdminTopbar } from "@/components/layout/AdminTopbar";
import { ThemeProvider } from "@/components/theme-provider";

const AdminSidebar = dynamic(
  () => import("@/components/layout/AdminSidebar").then((mod) => mod.AdminSidebar),
  { ssr: false },
);

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Vella Control",
  description: "Admin Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ThemeProvider>
          <div className="vc-shell flex min-h-screen">
            <aside className="vc-sidebar fixed inset-y-0 left-0 hidden w-64 text-slate-100 md:block">
              <AdminSidebar />
            </aside>
            <div className="vc-main flex min-h-screen flex-1 flex-col md:pl-64">
              <AdminTopbar>
                <span className="vc-subtitle text-sm">
                  Select a page to view details
                </span>
              </AdminTopbar>
              <main className="flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-6xl px-6 py-8">
                  {children}
                </div>
              </main>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}

