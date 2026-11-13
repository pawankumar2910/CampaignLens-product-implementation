# Release checklist

Evidence as of 13 November 2026. Local checks were run on Windows 11 with Node.js 24.19.0; CI ran on GitHub Actions (Ubuntu, Node.js 24). Each line is marked **Passed**, **Failed** or **Not run**. Nothing is marked passed unless it was actually executed on the committed code.

## Automated checks

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` | **Passed**, 0 errors, 0 warnings |
| Types | `npm run typecheck` | **Passed** |
| Unit tests | `npm test` | **Passed**, 53 tests |
| Integration tests on in-memory PostgreSQL (PGlite) | `npm test` | **Passed**, 29 tests |
| Production build | `next build` (run by the browser-test server) | **Passed**, no warnings |
| Browser tests against the production build | `npm run test:e2e` | **Passed**, 4 tests. Run three times in a row after the last test fix, plus once more on the final code: all green |
| Same suite through the production database driver, locally | `TEST_DATABASE_URL=postgres://… npm test` | **Passed**, 82 tests, with `node-postgres` talking the PostgreSQL wire protocol to a PGlite socket server |
| GitHub Actions, job "Lint, types, tests, build" | push to `main`, commit `27f1f9c` | **Passed** |
| GitHub Actions, job "Browser tests" | same run | **Passed** |
| GitHub Actions, job "Migrations and integration tests on PostgreSQL" (PostgreSQL 17 service container) | same run | **Passed**. This is the first run of the migrations and the suite against a real PostgreSQL server |

CI evidence: [run 43479014546](https://github.com/pawankumar2910/CampaignLens-product-implementation/actions/runs/43479014546). The job results were read from GitHub; the logs were not reviewed line by line.

### What the tests cover

| Area | Where | Result |
|---|---|---|
| Metric calculations from summed totals; hand-calculated fixtures; zero denominators | `tests/unit/metrics.test.ts` | **Passed** |
| Period boundaries: inclusive ranges, month and year crossings, one-day and leap-day ranges | `tests/unit/metrics.test.ts` | **Passed** |
| Percent change vs percentage points; "New", flat and unavailable states | `tests/unit/metrics.test.ts` | **Passed** |
| Pacing: expected, projected, remaining; before, during and after a period | `tests/unit/metrics.test.ts` | **Passed** |
| Coverage: missing days are gaps, not zeros | `tests/unit/metrics.test.ts` | **Passed** |
| CSV: BOM, CRLF, quoted commas, escaped quotes, quoted newlines, malformed quoting, size and row limits | `tests/unit/import.test.ts` | **Passed** |
| Row validation: negative, blank, invalid date, non-numeric, clicks above impressions, wrong currency, duplicates; nothing dropped silently | `tests/unit/import.test.ts` | **Passed** |
| Exact decimal parsing and half-up rounding without floating point | `tests/unit/import.test.ts` | **Passed** |
| Column mapping suggestions for Google Ads and Meta Ads style headers; fixed channel; date formats | `tests/unit/import.test.ts` | **Passed** |
| Repeat imports: identical, new and conflicting rows; replace vs keep | `tests/unit/import.test.ts`, `tests/integration/workflow.test.ts` | **Passed** |
| Migrations create the schema; data persists; the row grain is enforced by the database | `tests/integration/access.test.ts` | **Passed** |
| Role permissions: viewer, analyst and owner against every write | `tests/integration/access.test.ts` | **Passed** |
| Cross-agency isolation: 17 service calls plus mixed-id attempts all return "not found" | `tests/integration/access.test.ts` | **Passed** |
| Invitations: single use, bound to an email, expiry, revocation; an agency keeps an owner | `tests/integration/access.test.ts` | **Passed** |
| Report snapshots: draft refresh, frozen after finalize, duplicate | `tests/integration/workflow.test.ts` | **Passed** |
| Share links: finalized only, token stored as a hash, payload contains no workspace ids, expiry at the exact boundary, revocation, deletion | `tests/integration/workflow.test.ts` | **Passed** |
| Demo dataset: deterministic, about 90 days, expected patterns flagged, sandboxes isolated and cleaned up | `tests/integration/workflow.test.ts` | **Passed** |
| PDF: every section, chosen sections only, page numbers on every page, no page ends on a heading or table header, imported markup drawn as text | `tests/integration/pdf.test.ts` | **Passed** |
| Browser: demo onboarding, client selection, valid import with mapping, broken file refused, row errors need an explicit decision, repeat import decision, channel/period filters, empty period, campaign search and sort, campaign detail, report commentary and finalize, PDF download, share link, link exposes nothing else, revocation | `tests/e2e/workflow.spec.ts` | **Passed** |
| Browser: sign-up, onboarding, client creation, invitation, viewer cannot write, another agency sees "not found" on every client page, sign-out and sign-in, wrong password rejected | `tests/e2e/workflow.spec.ts` | **Passed** |
| User-controlled text: markup in campaign names and commentary is shown as text and never executes (web, shared report, PDF) | integration and browser tests | **Passed** |
| Unauthenticated requests: workspace pages redirect to sign-in; the PDF route returns 401; another agency's report returns 404 | browser tests | **Passed** |

## Inspected by eye

| What | Result |
|---|---|
| Desktop (1440px): landing, clients, overview, campaigns, investigate, pacing, reports list, report builder with preview | **Passed** in the in-app browser against the development server |
| Desktop: column mapping, import review, finalized report, shared report | **Passed** from screenshots captured by the browser tests (docs/screenshots) |
| Mobile (390px): overview | **Passed** from the captured screenshot |
| Mobile (390px): no horizontal page scroll on overview, campaigns, investigate, pacing, imports, new import, reports, settings, a report, team | **Passed** (automated measurement). It found one real defect, fixed: visually hidden text in a wide table widened the Team page by 60px |
| Exported PDF, final code, 4 pages | **Passed**: footer and "Page N of M" on every page, no split cards or table rows, each heading with its content, charts legible |
| Keyboard: skip link is the first stop; dialogs take focus, close on Escape and return focus; the chart reads values with arrow keys | **Passed** (automated) |

## Defects found and fixed during verification

1. PDF footer and page numbers did not render (a fixed `View`, then an inherited line height). Fixed; now asserted per page.
2. PDF section headings and a table header could be stranded at the bottom of a page. Fixed by binding each heading to its first block; now asserted.
3. Team page scrolled sideways at 390px. Fixed in the shared table style.
4. The "Draft saved." confirmation could be lost because the report builder remounted after saving. Fixed.
5. After saving, a draft could still look unsaved (which disabled the PDF link) when sections had been ticked in a different order. Fixed.
6. Duplicate element ids for the client switcher (rendered in the sidebar and the mobile header). Fixed.

## Not run

| Item | Why | What to do |
|---|---|---|
| A real PostgreSQL server on a developer machine | The Docker daemon was not running here. CI covers it on a PostgreSQL 17 service container (passed, see above) | Optional: `docker compose up -d`, then run `npm test` with `TEST_DATABASE_URL` set as in `.env.example` |
| Deployment to a hosting provider | No hosting or database credentials. Nothing has been deployed and there is no live URL | Follow docs/DEPLOYMENT.md, then its post-deploy checks |
| `npm run db:seed` | Not executed; the browser tests create their data through the interface instead | Run it once locally and sign in with the printed details |
| Browsers other than Chromium | Only Chromium is installed for the tests | Add Firefox and WebKit projects to `playwright.config.ts` |
| Screen reader pass | Not available here. Semantics, labels, live regions and focus handling are in place and partly asserted, but nothing replaces listening to it | Test with NVDA or VoiceOver: the import wizard and the chart first |
| Automated accessibility scan (axe) and measured colour contrast for all text | Not set up. Only the two chart colours were checked with a validator | Add `@axe-core/playwright` to the browser tests |
| Printing the web report from the browser | Print styles exist; the print preview was not opened. The supported export is the PDF download | Open a report, print preview, check page breaks |
| Mobile screens other than the overview, by eye | Checked for overflow automatically, not looked at individually | Walk through them at 390px |
| Load and performance | Not measured. No benchmark is claimed | Measure with a client of 50,000+ rows before relying on it at that size |
| Security review or penetration test | Not performed. Authorization and isolation are tested; that is not the same thing | Review before real client data is stored |

## Publishing

- [x] Repository initialized; staged files reviewed before the first commit: synthetic data only, no `.env.local`, no database files, no build output, and a scan for secrets found none.
- [x] Pushed to https://github.com/pawankumar2910/CampaignLens-product-implementation (public). CI passed on the first push.
- [ ] Deploy (docs/DEPLOYMENT.md) and add the live URL to the README only after the post-deploy checks pass. Until then there is no live URL, no customer, and no measured time saving to claim.
- [ ] Add a licence if you want to grant reuse rights. Without one, others may read the code but have no permission to reuse it.
