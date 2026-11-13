# CampaignLens product definition

## Primary user

An account manager at a digital marketing agency, preparing for a client review. They are comfortable with ad platforms and spreadsheets, are not an analyst or engineer, and are accountable for what they say to the client.

Secondary users: an agency owner who manages access, and a viewer (a colleague or stakeholder) who reads dashboards and reports.

## Core workflow

Create a client workspace → import campaign data → resolve data-quality issues → understand performance and budget pacing → prepare a branded report → share or download it.

Within the first minute a new visitor should be able to answer:

| Question | Where it is answered |
|---|---|
| What happened? | Overview: headline, seven KPIs with previous-period change, daily trend |
| Which campaigns need investigation? | Overview "Needs investigation" list; Investigate page |
| What should I check next? | Each investigation item ends with a next check |
| What can I confidently tell the client? | Overview "What you can tell the client": what the data supports, and what needs a caveat |

## Scope of this release

- Email and password accounts, agencies, memberships with owner / analyst / viewer roles, invite links.
- Client workspaces with currency, reporting timezone, conversion definition, report branding and thresholds.
- "Explore demo": a private, isolated sandbox per visitor with three fictional clients and about 90 days of deterministic synthetic data. Sandboxes are deleted after `DEMO_TTL_HOURS`.
- Guided CSV import with column mapping, normalized preview, errors and warnings, explicit decisions for rejected rows and changed values, and an import record with provenance.
- Performance workspace: KPIs, date / channel / campaign filters, equal-length previous-period comparison, time-series chart with a table alternative, sortable and searchable campaign table, campaign detail with underlying inputs.
- Budgets for a client or a campaign over any inclusive date range, with pacing.
- Investigation queue with configurable thresholds and minimum volumes.
- Report builder: draft and finalized states, data snapshot, commentary, section selection, branding, PDF export, expiring and revocable share links.

## Data contract

Row grain: one row per calendar date, channel and campaign, per client. The database enforces this with a unique index.

Repeat imports compare each incoming row with the stored row for the same key:

| Case | Result |
|---|---|
| Key not stored | Inserted |
| Key stored with identical values | Left untouched (re-importing a file changes nothing) |
| Key stored with different values | The user chooses: replace with the file's values, or keep the stored values |
| Key appears more than once in the file | Every such row is rejected |

Each import records the file name, a source description, who imported it and when, the mapping, the conflict decision, counts (rows in file, added, replaced, identical, kept, rejected), reporting coverage, currency, timezone and up to 200 issues.

## Formulas

| Metric | Formula | Unavailable when |
|---|---|---|
| CTR | clicks ÷ impressions | impressions = 0 |
| CPC | spend ÷ clicks | clicks = 0 |
| CPA | spend ÷ conversions | conversions = 0 |
| ROAS | reported revenue ÷ spend | spend = 0 |
| Change | (current − previous) ÷ previous | previous = 0 ("New" if current > 0) or either value unavailable |
| Point change (rates) | (current − previous) × 100 | either value unavailable |
| Expected spend | budget × elapsed days ÷ days in period | |
| Linear projection | observed spend ÷ elapsed days × days in period | before the period starts |

All sums are taken first; ratios are computed from the sums. Periods are inclusive calendar dates in the client's reporting timezone. Pacing counts spend through the last date that has data.

## Investigation rules

| Rule | Fires when (defaults) | Never fires when |
|---|---|---|
| Missing data | A channel has days without rows between its first and last reported day in the period; or the period extends past the last imported date | |
| Budget pacing | A budget in progress has a linear projection at least 10% away from the budget | The budget has not started or has finished |
| CPA increase | CPA rose at least 25% against the previous period | Either period has fewer than 10 conversions |
| Spend change | Spend moved at least 30%, stopped, or started from zero | Neither period reached 100.00 in spend; or the previous period has no data at all |
| No conversions | Spend of at least 100.00 with zero conversions | |
| Low volume | Spend of at least 100.00 with 1 to 9 conversions | |

Thresholds and minimum volumes are set per client. Every item shows the rule and thresholds used, the comparison period, the supporting numbers, a note on data sufficiency, and a next check.

## Interpretation limits the product states

- Attribution windows and conversion definitions differ by platform and affect comparability. Each client records its conversion definition, and reports print it.
- Platform-reported revenue is not deduplicated business revenue.
- ROAS is not profit and does not show incremental impact.
- A date with no rows is unknown, not zero.
- A linear projection is a reference point, not a forecast.
- Low-volume results are directional.

## Out of scope

Live ad platform connectors, cross-channel attribution, forecasting, profit or margin modelling, scheduled or emailed reports, single sign-on, billing, audit logs, AI-written narrative, custom investigation rules, multi-currency consolidation.
