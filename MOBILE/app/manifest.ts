import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vella",
    short_name: "Vella",
    description: "Your emotionally intelligent companion for clarity, insight, and calm.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#0F1115",
    background_color: "#0F1115",
    scope: "/",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png"
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ],
  };
}
