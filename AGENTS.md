## Cursor Cloud specific instructions

### Services

| Service | Port | Command |
|---|---|---|
| insider-streams-frontend (Next.js) | 3000 | `pnpm dev:insider-streams` |
| prediction-market-frontend (Next.js) | 3100 | `pnpm dev:prediction-market` |

*prediction-market-frontend is pinned to port 3100 so it does not collide with insider-streams on 3000.

### Key commands

See `CLAUDE.md` for full reference. Quick summary:

- **Lint**: `pnpm lint` (runs via Turborepo; `prediction-market-frontend` has a pre-existing lint error)
- **Build**: `turbo run build --filter=insider-streams-frontend` or `turbo run build --filter=prediction-market-frontend`
- **Dev**: `pnpm dev:insider-streams` / `pnpm dev:prediction-market`
- **Contracts build/test**: `pnpm build:contracts` / `pnpm test:contracts` (requires Foundry `forge`)

### Environment files

Both frontends require `.env.local` files. Required variables are validated by `@t3-oss/env-nextjs` in `src/env.ts`:

- `apps/insider-streams-frontend/.env.local`: `NEXT_PUBLIC_PROJECT_ID`, `NEXT_PUBLIC_SUBGRAPH_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (required); `OWNER_PK`, `SUPABASE_SERVICE_ROLE_KEY` (optional)
- `apps/prediction-market-frontend/.env.local`: `NEXT_PUBLIC_SUBGRAPH_URL` (required); Firebase vars optional

These are populated from injected secrets at setup time.

### Gotchas

- pnpm install shows "Ignored build scripts" warnings for native packages (esbuild, sharp, etc.) — these work fine via prebuilt binaries; do not run `pnpm approve-builds`.
- `@private-streams/scripts` build (`tsc --noEmit`) fails with a pre-existing missing `graphql-tag` type declaration. This does not affect frontend builds or dev servers.
- Git submodules under `contracts/lib/` must be initialized (`git submodule update --init --recursive`) for Foundry contract builds; not needed for frontend-only work.
- CRE workflows (under `cre-workflows/`) use Bun and are outside the pnpm workspace — they require separate `bun install` in each workflow directory.
