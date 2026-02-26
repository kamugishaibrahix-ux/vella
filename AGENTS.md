# AGENTS.md

## Cursor Cloud specific instructions

### Repository structure

This is a multi-app codebase (not a formal monorepo — no pnpm workspaces / turborepo). Two independent Next.js 14 apps, each with their own `package.json` and `pnpm-lock.yaml`:

| App | Path | Dev command | Default port |
|-----|------|-------------|--------------|
| MOBILE (Vella) | `MOBILE/` | `DATA_DESIGN_ACK=true pnpm dev` | 3000 |
| vella-control (Admin) | `apps/vella-control/` | `pnpm dev` (uses `--turbo`) | 3001 (set `PORT=3001`) |

### Environment files

- A single root `.env.local` at `/workspace/.env.local` is the authoritative env file for the MOBILE app. The `next.config.mjs` in MOBILE loads it via `scripts/envRootResolver.js`.
- The vella-control app needs its own `.env.local` at `apps/vella-control/.env.local`.
- The MOBILE predev script (`scripts/verifyDataDesignRead.mjs`) requires `DATA_DESIGN_ACK=true` in the environment or it will exit with code 1. Set this in the root `.env.local` or pass it inline.

### Running services

- **MOBILE**: `cd MOBILE && DATA_DESIGN_ACK=true pnpm dev` — starts on port 3000. The predev hook validates the DATA_DESIGN env var.
- **vella-control**: `cd apps/vella-control && PORT=3001 pnpm dev` — starts on port 3001 (use PORT env to avoid conflict with MOBILE).
- The MOBILE app stores all user content in browser localStorage (privacy-first). Most pages render without a real Supabase backend.
- Redis falls back to in-memory store in development (no Redis server needed).

### Lint / Test / Build

- **MOBILE lint**: `cd MOBILE && pnpm lint`
- **MOBILE tests**: `cd MOBILE && pnpm test -- --run` (vitest, 59 test files, jsdom environment)
- **vella-control lint**: `cd apps/vella-control && pnpm lint`
- **vella-control tests**: `cd apps/vella-control && pnpm test` (vitest run, node environment)
- Both apps build with `pnpm build`.

### Gotchas

- pnpm 10 blocks build scripts for `esbuild` and `unrs-resolver` by default. After `pnpm install`, run `pnpm rebuild esbuild unrs-resolver` in each app directory if Next.js fails to start. These are transitive dependencies so the rebuild may appear silent but is necessary for the native binaries.
- The `eslint-plugin-data-safety` in MOBILE is a local plugin (`file:./eslint-plugin-data-safety`). It is installed automatically with `pnpm install`.
- No Docker, Docker Compose, or containerized setup exists in this repo. All services run directly via Node.js/pnpm.
