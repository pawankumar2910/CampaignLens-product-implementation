# Architecture decision log

Short records of choices that shape the code, with the trade-off accepted. Newest last.

## 1. Next.js App Router with server components and server actions

**Decision.** One Next.js 16 application. Pages are server components that load data and call the analytics layer; mutations are server actions.

**Why.** A small team gets one deployable unit, no separate API to version, and data loading next to the page that uses it. Filters live in the URL as plain GET forms, so a view can be reloaded or sent to a colleague.

**Trade-off.** Server actions are public HTTP endpoints, so every one resolves the session and delegates to a service that authorizes. Streaming with a loading state means a not-found page inside the app is sent with HTTP 200; the content, not the status code, is what protects another agency's data, and the browser tests assert on content.

## 2. PostgreSQL with Drizzle; PGlite for local development and tests

**Decision.** One PostgreSQL schema and one set of SQL migrations. `DATABASE_URL=postgres://…` uses `node-postgres`; `pglite://…` uses PGlite, PostgreSQL compiled to WebAssembly and embedded in the Node process.

**Why.** A reviewer can run the product with `npm ci && npm run dev`, with no Docker or database install. Tests run against real PostgreSQL semantics (constraints, transactions, `numeric`, `jsonb`) in a few seconds, with a fresh database per test file.

**Trade-off.** Two drivers. This is contained in `src/lib/db/client.ts`; everything else sees one Drizzle database type. The whole suite also passes through `node-postgres` (see the release checklist), and CI runs it against a PostgreSQL service container. PGlite is single-process, so it is for development and tests only; production requires a server.

## 3. Better Auth for authentication; authorization written here

**Decision.** Better Auth handles accounts, password hashing, sessions and cookies. Roles, agency membership and scoping are our own tables and code.

**Why.** Authentication is the part most worth not writing. Authorization is the part most specific to the product, and keeping it as plain functions (`can`, `assertCan`, `requireClient`) makes it testable without a browser: the integration tests call every service as a viewer, an analyst and an owner of a different agency.

**Trade-off.** Better Auth's organization plugin was not used, so invitations are implemented here (about 150 lines).

## 4. Tenancy by agency id on every table, enforced in services

**Decision.** Every business table carries `agency_id`. Every service query filters on the actor's agency, and lookups by id go through `requireClient` / `requireReport`, which return "not found" for another agency's records.

**Why.** It is simple to read and to test. Returning "not found" rather than "forbidden" avoids confirming that an id exists.

**Trade-off.** Isolation depends on discipline in the service layer rather than on the database. PostgreSQL row-level security would add a second barrier; it was left out to keep the PGlite and server setups identical and is the first hardening step to take with real customer data.

## 5. Analytics as pure functions over rows; no SQL aggregation

**Decision.** The service layer loads a client's campaign-day rows and passes them to `analyze()`, which returns everything a screen or report shows.

**Why.** "Every displayed number comes from the same tested layer" becomes true by construction. The functions are deterministic and have hand-calculated fixtures.

**Trade-off.** All rows for a client are loaded per request. At the intended scale (tens of thousands of rows per client) this is milliseconds. A much larger account would need pre-aggregation, which would have to be tested against these functions.

## 6. Money as integer minor units; conversions with four decimals

**Decision.** Spend and revenue are stored and summed as integer cents. Imported amounts are parsed from text with string arithmetic and rounded half-up to two decimals, with a warning when precision is lost. Conversions are `numeric(16,4)` and summed as scaled integers.

**Why.** Sums are exact and reproducible. Fractional conversions are legitimate under data-driven attribution.

**Trade-off.** Only two-decimal currencies are supported (USD, EUR, GBP, INR, CAD, AUD).

## 7. Reports store a snapshot of the analysis

**Decision.** Creating a report computes the analysis once and stores it as JSON on the report row. Drafts can re-capture it; finalizing freezes it.

**Why.** The client sees a fixed version. The share page and the PDF need no workspace queries at all, which makes "a share link exposes only the report" a structural property rather than a filter that could be forgotten.

**Trade-off.** Snapshots duplicate data and are tied to a snapshot version (`version: 1`). A change to the analysis shape needs either a migration of stored snapshots or a renderer that handles both versions.

## 8. Share and invite links are capability URLs with hashed tokens

**Decision.** Tokens are 24 random bytes, shown once, stored only as SHA-256 hashes, with an expiry and a revocation timestamp. Unknown, expired and revoked tokens produce the same response. Share pages send `noindex` and `no-referrer`.

**Why.** A database leak does not expose working links, and a link cannot be probed for its state.

**Trade-off.** A lost link cannot be recovered; a new one must be created.

## 9. PDF rendered on the server with @react-pdf/renderer

**Decision.** The PDF is built from the snapshot with layout primitives, not by printing the web page in a headless browser.

**Why.** No browser binary on the server, deterministic output, and explicit control of page breaks (cards and table rows are never split, headings keep content with them). The PDF can be tested by extracting its text.

**Trade-off.** The report layout exists twice (web and PDF), sharing data, formatters and chart geometry. Built-in fonts cover Latin text only. An inherited `lineHeight` stops dynamic page numbers rendering in the version used, so line height is left at the library default.

## 10. Charts drawn as SVG without a charting library

**Decision.** One interactive time-series component and one static geometry function shared by the web report and the PDF.

**Why.** Full control over accessibility: keyboard stepping with announcements, a table alternative, gaps for missing days, dash pattern as well as colour. The two series colours (`#23805A`, `#8A63B8`) were checked with a palette validator for colour-vision-deficiency separation and contrast against the surface. One y-axis per chart; two measures get two charts.

**Trade-off.** Only the chart types the product needs exist.

## 11. Demo as a private sandbox per visitor

**Decision.** "Explore demo" creates a guest account and a new agency flagged as a demo, seeded from a deterministic generator, and deletes it after `DEMO_TTL_HOURS`.

**Why.** A reviewer can use the whole product, including imports, deletion and sharing, without affecting anyone else, and demo data can never appear in a real agency.

**Trade-off.** Each sandbox writes about 1,500 rows. Creation is rate-limited per network address, and expired sandboxes are removed when the next one is created (no background job).

## 12. No AI narrative

**Decision.** Summaries are rule-based templates. No model is called.

**Why.** The reporting workflow has to work, and be trusted, without one. The summary's value is that each sentence is traceable to a figure.

**If it is added later**, it must sit behind a server-side feature flag and respect this boundary: only authorized members can trigger it; it receives aggregates from the snapshot, never raw rows; imported text (campaign and channel names) is treated as untrusted data and never as instructions; the model returns structured output that is validated against the supplied metrics; requests have input limits, a timeout, per-user rate limits and a spending cap; any failure falls back to the rule-based summary; the model never computes a displayed metric; and tests use a mocked provider.
