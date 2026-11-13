# CampaignLens

Reporting and decision support for digital marketing agencies. An account manager imports campaign exports, sees what changed against the previous period, gets a short list of things to investigate, checks budget pacing, and sends the client a branded report.

![Overview of a client workspace](docs/screenshots/01-overview.png)

## The problem

Before a client review, an account manager pulls exports from several ad platforms into a spreadsheet and has to answer four questions quickly:

1. What happened?
2. Which campaigns need investigation?
3. What should I check next?
4. What can I confidently tell the client?

Spreadsheets make it easy to get the first answer subtly wrong (averaged ratios, mixed currencies, missing days read as zero) and give no help with the other three. CampaignLens is built around those four questions.

## Try it

No account, ad platform connection or API key is needed.

```sh
npm ci
npm run dev
```

Open http://localhost:3000 and choose **Explore the demo**. This creates a private sandbox with three fictional clients and 90 days of synthetic data. Sample CSV files for the import flow are linked from the import screen (and live in `public/samples`).

Requires Node.js 22 or later (developed on 24). On Windows PowerShell, use `npm.cmd` if `npm` is blocked by the execution policy. The database is embedded for local use, so there is nothing else to install. See [Local setup](#local-setup) for accounts, seeding and running on a PostgreSQL server.

## The workflow

| Step | What the product does |
|---|---|
| Create a client workspace | Each client has one currency, a reporting timezone, a conversion definition, report branding and its own thresholds. |
| Import campaign data | A guided import: choose a file, map columns to the canonical schema, preview normalized records, review errors and warnings, confirm, see a summary. |
| Resolve data-quality issues | Every rejected row is listed with its file row, field and reason. Changed values on a repeat import need an explicit replace-or-keep decision. Nothing is dropped silently. |
| Understand performance | Spend, reported revenue, conversions, CTR, CPC, CPA and ROAS against the equal-length previous period; a daily trend chart; a sortable, searchable campaign table; campaign detail with the underlying daily inputs. |
| Check pacing and what to investigate | Client and campaign budgets with observed spend, expected spend, remaining budget and a linear projection. A queue of rule-based flags, each with the rule, the comparison, the numbers, how far to trust it and a next check. |
| Prepare a branded report | Choose a period, add commentary, pick sections, apply the client's branding. Drafts can be refreshed; finalizing freezes the content and the data. |
| Share or download | PDF export with controlled page breaks, and read-only share links that expire and can be revoked. |

More screenshots: [investigation queue](docs/screenshots/02-investigate.png), [column mapping](docs/screenshots/03-import-mapping.png), [import review](docs/screenshots/04-import-review.png), [report](docs/screenshots/05-report.png), [shared report](docs/screenshots/06-shared-report.png), [mobile](docs/screenshots/07-mobile-overview.png). They are captured from the running application by the browser tests.

## How the numbers are kept honest

These rules are implemented in `src/lib/analytics` and `src/lib/import`, and each has tests with hand-calculated fixtures.

- **Ratios come from totals.** CTR, CPC, CPA and ROAS divide summed numerators by summed denominators. Row ratios are never averaged.
- **Zero denominators are unavailable.** They are `null` in code and "N/A" on screen, never 0 or Infinity.
- **Percent change and percentage points are different things.** CTR moving from 2.0% to 2.5% is +0.50 points and +25%. Growth from zero is shown as "New", not a percentage.
- **The previous period is explicit.** An N-day range is compared with the N days immediately before it; both ranges include their start and end dates.
- **Missing data is not zero.** A date with no rows is unknown. Charts show a gap, coverage is reported, and comparisons and pacing carry a caveat.
- **Money is exact.** Amounts are stored as integer minor units and parsed from text without floating point. Rounding happens only at display. Fractional conversions are allowed and kept to 4 decimals.
- **Currencies are never combined.** A client has one currency; rows in another currency are rejected, not converted.
- **Reported revenue is not business revenue.** Platforms use different attribution windows and can credit the same sale. ROAS is not profit and is not evidence of incremental impact. The interface and every report say so where it matters.
- **Flags are observations.** The investigation queue never states a cause and never recommends moving budget.

Summaries are rule-based templates filled with figures from the analytics layer. No AI model is used anywhere in the product.

## Architecture

```
Browser ── Next.js App Router (React Server Components, server actions)
              │
              ├─ src/app, src/components     presentation only
              ├─ src/lib/actions             server actions: resolve the session, call a service
              ├─ src/lib/services            authorization + agency scoping + validation (zod) + persistence
              ├─ src/lib/analytics           pure functions: metrics, comparison, coverage, pacing, queue, summary
              ├─ src/lib/import              pure functions: CSV parsing, mapping, normalization, repeat-import plan
              ├─ src/lib/reports             report snapshot type, trend geometry, PDF renderer
              └─ src/lib/db                  Drizzle schema, PostgreSQL / PGlite client, SQL migrations in ./drizzle
```

- **One analytics entry point.** Every screen, the report snapshot and the PDF get their figures from `analyze()`. There is no SQL aggregation that could drift from the tested functions.
- **Authorization lives in the service layer.** Each service function takes an `Actor` (user, agency, role), checks the role, and filters every query by agency. A record in another agency behaves exactly like one that does not exist. Server actions and route handlers never trust an id, role or agency from the browser.
- **Reports are snapshots.** A report stores the computed analysis as JSON. The preview, the share link and the PDF render only from that snapshot, so a finalized report cannot change and a share link cannot reach workspace data.
- **Share and invite tokens are stored as SHA-256 hashes** and shown once.
- **Database.** PostgreSQL through Drizzle ORM. Locally and in tests the same schema and migrations run on PGlite (PostgreSQL compiled to WebAssembly, embedded in the Node process); production uses a PostgreSQL server through `node-postgres`.
- **Authentication.** Better Auth with email and password, database sessions and signed HTTP-only cookies.

Decisions and their trade-offs are recorded in [docs/DECISIONS.md](docs/DECISIONS.md). Product scope is in [docs/PRODUCT.md](docs/PRODUCT.md).

## Local setup

```sh
npm ci
cp .env.example .env.local     # optional for development; see the file for each variable
npm run dev                    # http://localhost:3000
```

With no `.env.local`, development uses an embedded database in `.data/dev` and a development-only auth secret. Production refuses to start without `DATABASE_URL` and `BETTER_AUTH_SECRET`.

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` / `npm run typecheck` | ESLint and TypeScript |
| `npm test` | Unit and integration tests (Vitest, in-memory PostgreSQL) |
| `npm run test:e2e` | Browser tests (Playwright) against a production build with a fresh embedded database. First run: `npx playwright install chromium` |
| `npm run db:generate` | Create a new SQL migration from changes to `src/lib/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations to `DATABASE_URL` |
| `npm run db:seed` | Create a local account with the deterministic demo dataset (prints the sign-in details once) |
| `npm run setup` | Migrate, then seed |

To run on a PostgreSQL server locally: `docker compose up -d`, set `DATABASE_URL=postgres://campaignlens:campaignlens@localhost:5432/campaignlens` in `.env.local`, then `npm run setup`.

### Roles

| Role | Can do |
|---|---|
| Owner | Everything an analyst can, plus manage members and delete clients |
| Analyst | Create clients, import data, set budgets, build and share reports |
| Viewer | Read dashboards and reports |

Owners invite people from the Team page. There is no email service: the owner copies an invite link, which works once, for 7 days, and only for the invited email address.

## Import format

The canonical row is one calendar day for one channel and one campaign.

| Field | Required | Notes |
|---|---|---|
| Date | Yes | `YYYY-MM-DD`, `MM/DD/YYYY` or `DD/MM/YYYY`, chosen explicitly; a calendar day in the client's reporting timezone |
| Channel | Yes | A column, or one fixed name for a single-platform export |
| Campaign | Yes | Up to 200 characters |
| Spend | Yes | In the client's currency |
| Impressions, Clicks | Yes | Whole numbers; clicks cannot exceed impressions |
| Conversions | Yes | Decimals allowed |
| Reported revenue | No | If unmapped, recorded as 0 with a warning on the import |
| Currency | No | If mapped, every row must match the client's currency |

Limits: 5 MB and 20,000 rows per file. Header names from common Google Ads and Meta Ads exports are recognised and suggested; the user confirms the mapping. A blank number is an error, not a zero. Currency symbols and thousands separators are removed with a warning; decimal commas and Indian digit grouping are not guessed. Rows that share a date, channel and campaign are all rejected, because the file gives no way to tell which is right.

## Tests

| Suite | Count | Covers |
|---|---|---|
| Unit (`tests/unit`) | 53 | Metric maths, period boundaries, percent vs points, pacing, coverage, formatting, CSV structure, row validation, exact decimal parsing, column mapping, repeat-import plan |
| Integration (`tests/integration`) | 29 | Migrations, persistence, role permissions, cross-agency isolation, invitations, imports end to end, report snapshots, share-link expiry and revocation, demo dataset, PDF content and page count |
| Browser (`tests/e2e`) | 4 | Demo onboarding, client selection, valid import, validation failure, repeat import, filtering, report creation, PDF download, sharing and revocation; sign-up, roles and isolation over HTTP; 390px layout; keyboard use |

No test calls an external or paid service. What was run, and what was not, is in [docs/RELEASE-CHECKLIST.md](docs/RELEASE-CHECKLIST.md).

## Deployment

The app is a standard Next.js server plus a PostgreSQL database. [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) covers environment variables, a Vercel + managed PostgreSQL setup, any-Node-host setup, migrations and rollback. **It has not been deployed**: there is no live URL, and the deployment steps have not been executed.

## Limitations

- CSV import only. There are no live connections to ad platforms.
- No cross-channel attribution or deduplication. Revenue and conversions are whatever each platform reported.
- Budget projections are linear and ignore seasonality, flighting and daily caps.
- The investigation rules are fixed in code; only their thresholds are configurable per client.
- Email is not sent. Invitations and share links are copied by hand, and there is no password reset or email verification flow.
- Rate limiting (sign-in, demo creation, share links) is held in memory per server instance.
- PDFs use the built-in Latin fonts. Non-Latin characters in campaign names print as "?" in the PDF (the web report shows them correctly), and Indian rupee amounts print with the code `INR`.
- Timestamps are shown in UTC. Campaign dates are calendar days and are never converted.
- Light theme only.
- The demo dataset is fixed to 14 Aug to 11 Nov 2026 so that it is reproducible; it does not move with today's date.
- No AI narrative. [docs/DECISIONS.md](docs/DECISIONS.md) describes the boundary one would have to respect.
- No customer has used this. There are no measured time savings or business results to report.

## Project documents

- [docs/PRODUCT.md](docs/PRODUCT.md): user, workflow, scope, formulas
- [docs/DECISIONS.md](docs/DECISIONS.md): architecture decision log
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): hosting, environment, migrations, rollback
- [docs/DEMO-SCRIPT.md](docs/DEMO-SCRIPT.md): a three-minute walkthrough
- [docs/RELEASE-CHECKLIST.md](docs/RELEASE-CHECKLIST.md): evidence for each check
- [docs/PROGRESS.md](docs/PROGRESS.md): milestone log

Built with AI assistance (Claude Code). The analytics rules, tests and browser checks listed above are how the result was verified.
