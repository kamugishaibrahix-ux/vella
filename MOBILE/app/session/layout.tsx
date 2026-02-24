"use client";

import { VellaProvider } from "@/lib/realtime/VellaProvider";

export default function SessionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="session-accent-scope"
      style={
        {
          "--vella-accent": "#4a7c59",
          "--vella-accent-soft": "#e8f0ea",
          "--vella-accent-muted": "#6b8f6e",
        } as React.CSSProperties
      }
    >
      <VellaProvider>{children}</VellaProvider>
    </div>
  );
}
