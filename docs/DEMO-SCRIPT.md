# Demo script (about three minutes)

Everything shown is fictional data from the built-in demo. Run `npm run dev`, open http://localhost:3000, and keep `public/samples` handy for the import step.

## 0:00 The problem

"Before a client review, an account manager has exports from several ad platforms and four questions: what happened, what needs a look, what to check next, and what they can safely tell the client. CampaignLens is built around those."

Click **Explore the demo**. Point out the banner: a private sandbox, fictional companies.

## 0:20 What happened

On the Fernhill Outdoor overview:

- The headline and seven KPIs, each against the previous 30 days. Note that CTR shows a change in points, not percent.
- The period line under the filters states both date ranges and that both ends are included.
- Focus the chart and press the arrow keys: it reads out daily values. Open "View this chart as a table".

"Every figure here comes from one tested function. Ratios are computed from totals, never averaged."

## 0:50 What needs a look, and what to check next

Open **Investigate**.

- "CPA rose 30.8% on Meta Ads / Prospecting: lookalike." Show the four parts: why it is flagged (with the thresholds), what was compared, how much to trust it, and the next check. CPC is flat and click-to-conversion rate fell, so that is where to look.
- Scroll to "New activity" and "Low volume": a new campaign gets no percentage, and five conversions are called directional.

"These are observations with a next check. The product never states a cause and never tells you to move budget."

Switch client to **Brightside Dental Group**: the first item is three missing days in the Meta export. "A missing day is unknown, not zero, and the totals say so."

## 1:30 Import with mapping and validation

Back on Fernhill, **Imports → Import a CSV**.

1. Choose `fernhill-meta-export-with-errors.csv`, describe the source, continue.
2. Mapping: Meta's column names are recognised. There is no channel column, so type "Meta Ads".
3. Preview: 5 valid rows, 7 with errors.
4. Review: each error has a file row and a reason: a blank spend ("a blank is not treated as zero"), an impossible date, clicks above impressions, two rows for the same day.
5. The import button stays disabled until you tick the box accepting that 7 rows are left out. Import.

"Nothing is dropped silently. The summary accounts for every row in the file."

Optional: import `fernhill-brand-search-restated.csv` to show the replace-or-keep decision for values that changed.

## 2:15 Budget pacing

Open **Budget pacing**. Observed spend, where even pacing would be today, remaining budget, and a projection that is labelled linear and "not a forecast".

## 2:30 Report and sharing

**Reports → Create draft report**.

- Type a line of commentary and untick a section; the preview updates.
- **Finalize**: content and data are now locked. Importing more data will not change this report.
- **Download PDF**.
- **Create share link**, open it in a private window: the report and nothing else. Revoke it, reload: gone.

## 2:55 Close

"Under this: role checks and agency isolation enforced on the server and tested, 82 unit and integration tests on a real PostgreSQL engine, and browser tests for this whole flow."

## If asked

- **Is the revenue real revenue?** No. It is what each platform attributed. Channels can claim the same sale. The report says so.
- **Why no AI summary?** Each sentence in the summary is traceable to a number. The decision log describes the conditions under which a model could be added.
- **What is not built?** Live platform connections, attribution, forecasting, email. See Limitations in the README.
