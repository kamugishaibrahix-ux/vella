import { fileURLToPath } from "node:url";
import path from "node:path";
import envResolver from "../scripts/envRootResolver.js";

const { loadRootEnv } = envResolver;

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
loadRootEnv({ startDir: repoRoot });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;

