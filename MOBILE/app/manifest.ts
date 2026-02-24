import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vella",
    short_name: "Vella",
    description: "Your emotionally intelligent companion for clarity, insight, and calm.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0F1115",
    theme_color: "#0F1115",
    scope: "/",
    icons: [
      {
        src: "/logo-vella.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  } as MetadataRoute.Manifest & { appleWebApp?: { capable: boolean; statusBarStyle: string; title: string } };
}

