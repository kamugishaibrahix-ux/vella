# Vella Control – Dev Server Instructions

To install dependencies and run the Vella Control dashboard:

```bash
# 1. Go into the vella-control app folder
cd apps/vella-control

# 2. Install dependencies for this app
pnpm install

# 3. Start the dev server
pnpm dev
```

If you see `Cannot find module '...node_modules/next/dist/bin/next'`, it usually means
you haven't run `pnpm install` inside `apps/vella-control` yet.

