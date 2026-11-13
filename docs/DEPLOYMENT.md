# Deployment

**Status: not deployed.** Nothing in this document has been executed against a hosting provider. There is no live URL. The local production build, the browser tests against it, and the database migrations are verified (see RELEASE-CHECKLIST.md); the provider steps below are instructions, not a record of a deployment.

CampaignLens is one Next.js server (Node.js runtime) and one PostgreSQL database. It needs no other infrastructure: no queue, cache, object storage or email service.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes in production | `postgres://user:password@host:5432/database`. Use the provider's pooled connection string if it offers one. |
| `BETTER_AUTH_SECRET` | Yes in production | Signs session cookies. At least 32 random characters. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Rotating it signs everyone out. |
| `BETTER_AUTH_URL` | Yes in production | Public origin of the site, for example `https://reports.example.com`, with no trailing slash. Must be `https` in production so cookies are marked secure. |
| `DATABASE_SSL` | No | `true` to require verified TLS when the connection string does not already carry `sslmode`. |
| `DATABASE_POOL_MAX` | No | Connections per server instance. Default 5. Keep it low on serverless platforms. |
| `DEMO_TTL_HOURS` | No | Lifetime of an "Explore demo" sandbox. Default 24. |

The server refuses to start in production without `DATABASE_URL`, and refuses to create sessions without a `BETTER_AUTH_SECRET` of at least 32 characters. No variable is exposed to the browser. `.env.example` lists the same names with explanations and no values.

## Option A: Vercel with a managed PostgreSQL

1. Push the repository to GitHub.
2. Create a PostgreSQL database with a managed provider (Neon, Supabase, RDS, or any PostgreSQL 14 or later). Copy its connection string.
3. Apply the migrations from your machine: `DATABASE_URL="<production connection string>" npm run db:migrate`.
4. In Vercel, import the repository. Framework preset: Next.js. Leave the build and install commands at their defaults.
5. Add `DATABASE_URL`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` for the Production environment. Give Preview deployments a different database, so a preview can never read or migrate production data.
6. Deploy, then run the post-deploy checks below against the deployed URL.

Notes for serverless hosting:

- Rate limiting for sign-in, demo creation and share links is held in memory per server instance. With many instances the limits are looser than configured. For stricter limits, switch Better Auth to database-backed rate limiting and replace `src/lib/rate-limit.ts` with a shared store.
- PDF rendering runs in the Node.js runtime, not the Edge runtime.
- Expired demo sandboxes are deleted when the next visitor starts a demo. If nobody does, they stay until then; schedule a call to `cleanupExpiredDemos()` if that matters.

## Option B: any Node.js host (Render, Fly.io, Railway, a VM)

```sh
npm ci
npm run build
npm run db:migrate
npm start            # listens on PORT, default 3000
```

Run with `NODE_ENV=production` and the variables above. Put it behind TLS. A single instance makes the in-memory rate limits exact.

## Migrations

Migrations are plain SQL files in `drizzle/`, generated from `src/lib/db/schema.ts` and committed with the code that needs them.

```sh
npm run db:generate   # after editing schema.ts: writes drizzle/NNNN_name.sql
npm run db:migrate    # applies pending files to DATABASE_URL, in order, each in a transaction
```

Applied migrations are recorded in the `drizzle.__drizzle_migrations` table, so running the command again is a no-op.

Rules that keep deployments reversible:

1. **Migrate before the new code serves traffic.** Run `db:migrate` as a release step, never from application code. (The embedded development database is the one exception: it migrates itself on start.)
2. **Expand, then contract.** A migration that ships with a release must work with both the previous and the new application version: add nullable columns and new tables first; remove or rename only in a later release, once no running code uses the old shape.
3. **Review the generated SQL** before committing it. Check anything that rewrites a table, drops a column or changes a type.

## Rollback

**Application.** Redeploy the previous build (on Vercel: Promote or Instant Rollback on the previous deployment; elsewhere: redeploy the previous commit). Because of rule 2, the previous application version works with the current schema, so the database does not need to change.

**Database.** Migrations are forward-only; there are no down files. To undo a schema change:

1. Before every production migration, take a restore point: a provider branch or snapshot, or `pg_dump --format=custom --file=before-NNNN.dump "$DATABASE_URL"`.
2. To reverse a change without losing data written since, add a new migration that undoes it (`npm run db:generate` after reverting `schema.ts`) and apply it. This is the normal path.
3. Restore from the snapshot (`pg_restore --clean --if-exists --dbname="$DATABASE_URL" before-NNNN.dump`) only when data was damaged, and accept that writes made after the snapshot are lost. Take the application offline first.

**Data inside the product.** Imports are not destructive except when a user chooses "replace"; the import record shows who replaced what and when. Finalized reports keep their own data and are unaffected by later imports.

## Post-deploy checks

Run these on the deployed URL before sharing it:

- [ ] The landing page loads over HTTPS and "Explore the demo" opens a sandbox.
- [ ] Sign up, create an agency and a client, import `public/samples/fernhill-google-ads-pmax.csv` (use a USD client).
- [ ] Create, finalize and download a report; open a share link in a private window; revoke it and confirm it stops working.
- [ ] Sign out; `/clients` redirects to `/sign-in`.
- [ ] Response headers on `/share/...` include `X-Robots-Tag: noindex, nofollow`.
- [ ] `npm run test:e2e` still passes locally on the deployed commit.

## Operating notes

- **Backups.** The database is the only state. Use the provider's point-in-time recovery or scheduled `pg_dump`.
- **Secrets.** Never commit `.env.local`. Rotate `BETTER_AUTH_SECRET` if it is exposed.
- **Data handling.** Campaign exports can contain client-confidential figures. The repository contains only synthetic data; keep private fixtures in the git-ignored `private-data/` folder.
