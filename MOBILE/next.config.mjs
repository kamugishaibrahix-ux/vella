import { fileURLToPath } from "node:url";
import path from "node:path";
import envResolver from "../scripts/envRootResolver.js";
import withPWA from "next-pwa";

const { loadRootEnv } = envResolver;

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
loadRootEnv({ startDir: repoRoot });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  experimental: {
    typedRoutes: true,
    instrumentationHook: true,
  },
};

const pwaConfig = withPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  fallbacks: {
    document: "/offline",
  },
  runtimeCaching: [
    // API routes - NetworkOnly (no caching)
    {
      urlPattern: /\/api\/.*/,
      handler: "NetworkOnly",
      options: {
        cacheName: "api-cache",
      },
    },
    // Realtime routes - NetworkOnly
    {
      urlPattern: /\/realtime\/.*/,
      handler: "NetworkOnly",
      options: {
        cacheName: "realtime-cache",
      },
    },
    // Stripe routes - NetworkOnly
    {
      urlPattern: /\/stripe\/.*/,
      handler: "NetworkOnly",
      options: {
        cacheName: "stripe-cache",
      },
    },
    // Auth routes - NetworkOnly
    {
      urlPattern: /\/auth\/.*/,
      handler: "NetworkOnly",
      options: {
        cacheName: "auth-cache",
      },
    },
    // Static files - CacheFirst
    {
      urlPattern: /\.(?:js|css)$/i,
      handler: "CacheFirst",
      options: {
        cacheName: "static-resources",
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
        },
      },
    },
    // Fonts - CacheFirst
    {
      urlPattern: /\.(?:woff|woff2|ttf|otf|eot)$/i,
      handler: "CacheFirst",
      options: {
        cacheName: "font-cache",
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        },
      },
    },
    // Images - CacheFirst
    {
      urlPattern: /\.(?:png|jpg|jpeg|gif|webp|svg)$/i,
      handler: "CacheFirst",
      options: {
        cacheName: "image-cache",
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
        },
      },
    },
    // HTML pages - NetworkFirst
    {
      urlPattern: /^\/[^?]*$/,
      handler: "NetworkFirst",
      options: {
        cacheName: "page-cache",
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60, // 1 day
        },
        networkTimeoutSeconds: 10,
      },
    },
  ],
  buildExcludes: [/middleware-manifest\.json$/],
})(nextConfig);

export default pwaConfig;
