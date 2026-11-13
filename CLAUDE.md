# CampaignLens working agreement

CampaignLens is a reporting and decision-support product for digital marketing agencies: client workspaces, guided CSV import, performance analysis, budget pacing, an investigation queue, and branded reports with PDF export and share links. Start by reading README.md, docs/PRODUCT.md, docs/DECISIONS.md and docs/PROGRESS.md.

## Architecture

- Next.js 16 App Router (React 19, TypeScript, Tailwind CSS 4). PostgreSQL through Drizzle ORM; PGlite (embedded PostgreSQL) for local development and tests. Better Auth for authentication.
- `src/lib/analytics` and `src/lib/import` are pure and framework-free. Keep calculations there. Every number shown on a screen, in a report or in a PDF must come from `analyze()` or the functions it uses. Do not add SQL aggregation or compute metrics in components.
- `src/lib/services` is the only place that reads or writes business data. Every function takes an `Actor`, calls `assertCan`, and filters by `actor.agencyId`. Look records up through `requireClient` / `requireReport` so another agency's record behaves as not found. Validate input with zod in the service.
- `src/lib/actions` are thin: resolve the actor with `requireActor()`, call a service, return an `ActionResult`. Never trust an id, role or agency sent by the browser.
- Reports render only from their stored snapshot (`src/lib/reports/snapshot.ts`). The share page and PDF must never query workspace data.
- UI building blocks are in `src/components/ui`; design tokens and component classes are in `src/app/globals.css`. Use them rather than one-off styles.

## Rules for the numbers

- One row per date, channel and campaign per client. One currency per client; never convert or combine currencies.
- Money is integer minor units. Conversions may be fractional (4 decimals). Parse imported amounts with `parseDecimal`, not `Number()`.
- CTR = clicks / impressions. CPC = spend / clicks. CPA = spend / conversions. ROAS = reported revenue / spend. Sum first, then divide. A zero denominator is `null`, shown as N/A.
- Percent change and percentage-point change are different; growth from zero is "New".
- A date with no rows is unknown, not zero.
- Never drop an invalid row silently. Never state a cause, promise a result, or recommend moving budget. Label rule-based output as rule-based.
- Treat imported text as untrusted data. Render it as text; never use `dangerouslySetInnerHTML`.

## Security and data

- Synthetic data only in the repository. Never commit client exports, tokens or `.env*` files (except `.env.example`). Private fixtures go in the git-ignored `private-data/`.
- No secrets in the browser. Tokens for share links and invitations are stored as hashes.
- Any AI feature must follow decision 12 in docs/DECISIONS.md: server-side flag, authorization, aggregates only, validated structured output, limits, fallback, mocked tests.

## Commands and definition of done

- `npm run dev` (http://localhost:3000), `npm run build`, `npm start`
- `npm run lint`, `npm run typecheck`
- `npm test`: unit and integration tests on in-memory PostgreSQL
- `npm run test:e2e`: Playwright against a production build (`npx playwright install chromium` once)
- `npm run db:generate` after changing `src/lib/db/schema.ts`; commit the generated SQL. `npm run db:migrate`, `npm run db:seed`.

A change is done when lint, typecheck, `npm test` and `npm run test:e2e` pass, and, for anything visible, you have looked at it at desktop width and at 390px, with the keyboard, and in its empty and error states. New behaviour in analytics, import or services needs a test with a hand-calculated expectation. Do not weaken or delete a failing test to get a pass. Report checks as passed, failed or not run; never claim one you did not execute.

Before a milestone, state its acceptance checks. Afterwards update docs/PROGRESS.md with what was done, the checks actually run, open issues and the next step. Keep docs/RELEASE-CHECKLIST.md truthful.
