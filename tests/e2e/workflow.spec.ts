import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * End-to-end checks through a real browser against a production build.
 * Screenshots of the actual application are written to docs/screenshots.
 */
const SHOTS = 'docs/screenshots';
mkdirSync(SHOTS, { recursive: true });
const sample = (name: string) => `public/samples/${name}`;
const sidebar = (page: Page) => page.locator('aside');
const nav = (page: Page, name: string) => sidebar(page).getByRole('link', { name, exact: true });

async function startDemo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Fernhill Outdoor' })).toBeVisible();
}

async function chooseFile(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }, source: string) {
  await page.getByLabel(/Campaign export/).setInputFiles(file);
  await expect(page.getByText('is readable')).toBeVisible();
  await page.getByLabel('Where did this file come from?').fill(source);
  await page.getByRole('button', { name: 'Continue to mapping' }).click();
}

test('demo onboarding, client selection, imports, filtering, report, PDF and sharing', async ({ page, browser }) => {
  await test.step('Explore demo opens a private sandbox with fictional data', async () => {
    await startDemo(page);
    await expect(page.getByText('Demo sandbox')).toBeVisible();
    await expect(page.getByText('Every company, campaign and number here is fictional.')).toBeVisible();
    // Deterministic demo data: these figures are asserted in the integration tests too.
    const kpis = page.getByRole('region', { name: 'What happened' });
    await expect(kpis).toContainText('$40,513');
    await expect(kpis).toContainText('1,244.81');
    await expect(page.getByRole('region', { name: 'Needs investigation' })).toContainText('CPA rose 30.8% on Meta Ads / Prospecting: lookalike');
    await expect(page.getByRole('region', { name: 'What you can tell the client' })).toContainText('not deduplicated revenue, profit, or proof of incremental impact');
    await page.screenshot({ path: `${SHOTS}/01-overview.png` });
  });

  await test.step('Client selection keeps each client in its own currency', async () => {
    await sidebar(page).getByLabel('Client', { exact: true }).selectOption({ label: 'Kettle & Loom' });
    await expect(page.getByRole('heading', { level: 1, name: 'Kettle & Loom' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'What happened' })).toContainText('£');
    await sidebar(page).getByLabel('Client', { exact: true }).selectOption({ label: 'Fernhill Outdoor' });
    await expect(page.getByRole('heading', { level: 1, name: 'Fernhill Outdoor' })).toBeVisible();
  });

  await test.step('The chart can be read with the keyboard and as a table', async () => {
    const chart = page.getByRole('group', { name: /Daily Spend chart/ });
    await chart.focus();
    await page.keyboard.press('ArrowRight');
    await expect(chart.locator('p[aria-live]')).toContainText('13 Oct 2026: Spend $');
    await page.keyboard.press('End');
    await expect(chart.locator('p[aria-live]')).toContainText('11 Nov 2026: Spend $');
    await page.getByText('View this chart as a table').click();
    await expect(page.getByRole('table', { name: 'Daily Spend' })).toBeVisible();
  });

  await test.step('Valid import: map columns, preview, confirm, summary', async () => {
    await nav(page, 'Imports').click();
    await page.getByRole('link', { name: 'Import a CSV' }).click();
    await chooseFile(page, sample('fernhill-google-ads-pmax.csv'), 'Google Ads campaign report');
    // The export has no channel column, so the wizard asks for one channel name.
    await expect(page.getByLabel('Spend')).toHaveValue('Cost');
    await expect(page.getByLabel('Reported revenue')).toHaveValue('Conv. value');
    await page.getByLabel('Channel name for every row').fill('Google Ads');
    await page.screenshot({ path: `${SHOTS}/03-import-mapping.png` });
    await page.getByRole('button', { name: 'Check file and preview' }).click();
    await expect(page.getByText('All rows are valid')).toBeVisible();
    await expect(page.getByText('11 new · 0 identical · 0 with different values')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Preview of normalized records' })).toContainText('Performance Max: winter range');
    await page.getByRole('button', { name: 'Continue to confirm' }).click();
    await page.getByRole('button', { name: 'Import 11 row(s)' }).click();
    await expect(page).toHaveURL(/\/imports\/[0-9a-f-]{36}\?done=1$/);
    await expect(page.getByText('Import complete: 11 row(s) written')).toBeVisible();
    await expect(page.getByText('Google Ads campaign report')).toBeVisible();
  });

  await test.step('Validation failure: a broken file is refused and row errors are never dropped silently', async () => {
    await page.getByRole('link', { name: 'Import another file' }).click();
    await page.getByLabel(/Campaign export/).setInputFiles({ name: 'broken.csv', mimeType: 'text/csv', buffer: Buffer.from('date,channel\n2026-11-01,"Google') });
    const alert = page.getByRole('alert').filter({ hasText: 'This file was not imported' });
    await expect(alert).toContainText('a quoted value is never closed');
    await expect(alert).toContainText('existing data is intact');

    await chooseFile(page, sample('fernhill-meta-export-with-errors.csv'), 'Meta Ads export');
    await expect(page.getByLabel('Spend')).toHaveValue('Amount spent (USD)');
    await page.getByLabel('Channel name for every row').fill('Meta Ads');
    await page.getByRole('button', { name: 'Check file and preview' }).click();
    await expect(page.getByText('7 rows have errors')).toBeVisible();
    await page.getByRole('button', { name: /Review \d+ issue/ }).click();
    const issues = page.getByRole('table', { name: 'Validation issues by file row' });
    await expect(issues).toContainText('Date "2026-11-31" is not a valid YYYY-MM-DD date.');
    await expect(issues).toContainText('Spend is blank. A blank is not treated as zero');
    await expect(issues).toContainText('Clicks (9999999) cannot exceed impressions (17040).');
    await expect(issues).toContainText('share the same date, channel and campaign');
    await page.screenshot({ path: `${SHOTS}/04-import-review.png`, fullPage: true });
    // Importing only the valid rows requires an explicit decision.
    const importButton = page.getByRole('button', { name: 'Import 5 row(s)' });
    await expect(importButton).toBeDisabled();
    await page.getByRole('checkbox').check();
    await importButton.click();
    await expect(page.getByText('Import complete: 5 row(s) written')).toBeVisible();
    await expect(page.getByText('7 row(s) with errors were left out')).toBeVisible();
  });

  await test.step('Repeat import: changed values need a replace-or-keep decision', async () => {
    await page.getByRole('link', { name: 'Import another file' }).click();
    await chooseFile(page, sample('fernhill-brand-search-restated.csv'), 'Google Ads restated export');
    await page.getByRole('button', { name: 'Check file and preview' }).click();
    await expect(page.getByText('0 new · 4 identical · 3 with different values')).toBeVisible();
    await page.getByRole('button', { name: /Review \d+ issue|Continue to confirm/ }).click();
    await expect(page.getByRole('button', { name: /Record import|Import/ }).last()).toBeDisabled();
    await page.getByRole('radio', { name: /Replace/ }).check();
    await page.getByRole('button', { name: 'Import 3 row(s)' }).click();
    await expect(page.getByText('Import complete: 3 row(s) written')).toBeVisible();
  });

  await test.step('Dashboard filtering by channel, period and campaign search', async () => {
    await nav(page, 'Overview').click();
    await page.getByLabel('Channel', { exact: true }).selectOption('Meta Ads');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page).toHaveURL(/channel=Meta\+Ads/);
    await expect(page.getByText('filtered to Meta Ads')).toBeVisible();
    await expect(page.getByRole('table', { name: /Performance by channel/ }).locator('tbody tr')).toHaveCount(1);

    await page.getByRole('link', { name: 'Last 7 days' }).click();
    await expect(page).toHaveURL(/from=2026-11-05&to=2026-11-11/);
    await expect(page.getByText('5 Nov – 11 Nov 2026', { exact: true })).toBeVisible();

    await page.goto(page.url().replace(/\?.*$/, '?from=2025-01-01&to=2025-01-31'));
    await expect(page.getByRole('heading', { name: 'No data for these dates' })).toBeVisible();
    await page.getByRole('link', { name: 'Show the last 30 days with data' }).click();
    // Wait for the navigation to finish: sidebar links carry the selected period, so clicking early would keep the empty one.
    await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('region', { name: 'What happened' })).toBeVisible();

    await nav(page, 'Campaigns').click();
    await expect(page.getByRole('status')).toContainText('Showing 9 of 9 campaigns');
    await page.getByLabel('Search campaigns').fill('brand');
    await expect(page.getByRole('status')).toContainText('Showing 2 of 9 campaigns');
    await page.getByRole('button', { name: 'CPA' }).click();
    await expect(page.getByRole('columnheader', { name: 'CPA' })).toHaveAttribute('aria-sort', 'descending');
    await page.getByLabel('Search campaigns').fill('');
    await page.getByRole('link', { name: 'Prospecting: lookalike' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Prospecting: lookalike' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Underlying inputs' })).toBeVisible();
    await expect(page.getByText('CPA rose 30.8% on Meta Ads / Prospecting: lookalike')).toBeVisible();

    await nav(page, 'Investigate').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Investigate' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/02-investigate.png` });
  });

  let reportTitle = '';
  await test.step('Report creation: commentary, sections, finalize', async () => {
    await nav(page, 'Reports').click();
    await page.getByRole('button', { name: 'Create draft report' }).click();
    await expect(page).toHaveURL(/\/reports\/[0-9a-f-]{36}$/);
    reportTitle = await page.getByLabel('Title').inputValue();
    // User-written text is shown as text, never interpreted as markup.
    await page.getByLabel('Your commentary').fill('A steady month. <b>Not bold</b> <script>window.__xss = 1</script>');
    await page.getByRole('checkbox', { name: /Items under review/ }).check();
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved.')).toBeVisible();
    const preview = page.getByRole('article', { name: /^Report:/ });
    await expect(preview).toContainText('<b>Not bold</b> <script>window.__xss = 1</script>');
    await expect(preview.getByRole('heading', { name: 'Items under review' })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();

    await page.getByRole('button', { name: 'Finalize…' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Finalize report' }).click();
    await expect(page.getByRole('heading', { name: 'Finalized report' })).toBeVisible();
    await expect(page.getByLabel('Title')).toHaveCount(0); // no longer editable
    await page.screenshot({ path: `${SHOTS}/05-report.png` });
  });

  await test.step('PDF export downloads a real PDF', async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download PDF' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^fernhill-outdoor-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.pdf$/);
    const file = 'test-results/e2e-report.pdf';
    await download.saveAs(file);
    const bytes = readFileSync(file);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(8_000);
  });

  await test.step('Sharing: a read-only link that exposes only the report, then revocation', async () => {
    await page.getByRole('button', { name: 'Create share link' }).click();
    const url = await page.getByLabel('New link, shown only once').inputValue();
    expect(url).toMatch(/\/share\/[\w-]{32}$/);

    const anonymous = await browser.newContext();
    const visitor = await anonymous.newPage();
    await visitor.goto(url);
    await expect(visitor.getByRole('heading', { level: 1, name: reportTitle })).toBeVisible();
    await expect(visitor.getByText('Read-only report shared by')).toBeVisible();
    await expect(visitor.getByText('<b>Not bold</b>')).toBeVisible();
    // No workspace navigation, controls or other clients are present.
    await expect(visitor.getByRole('link', { name: /Client settings|Imports|Campaigns|Team|All clients/ })).toHaveCount(0);
    await expect(visitor.getByText('Kettle & Loom')).toHaveCount(0);
    await expect(visitor.getByRole('textbox')).toHaveCount(0);
    await visitor.screenshot({ path: `${SHOTS}/06-shared-report.png` });

    // The link grants nothing beyond the report: workspace pages still require a session.
    const workspace = await visitor.request.get('/clients', { maxRedirects: 0 });
    expect(workspace.status()).toBe(307);
    expect(workspace.headers().location).toContain('/sign-in');
    const privatePdf = await visitor.request.get(page.url().replace(/\/$/, '') + '/pdf');
    expect(privatePdf.status()).toBe(401);
    const sharedPdf = await visitor.request.get(`${url}/pdf`);
    expect(sharedPdf.status()).toBe(200);
    expect(sharedPdf.headers()['content-type']).toBe('application/pdf');
    const response = await visitor.request.get(url);
    expect(response.headers()['x-robots-tag']).toContain('noindex');

    await visitor.goto(`${url}x`);
    await expect(visitor.getByRole('heading', { name: 'This link is not available' })).toBeVisible();

    await page.getByRole('button', { name: 'Revoke' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Revoke link' }).click();
    await expect(page.getByText('Revoked', { exact: true })).toBeVisible();
    await visitor.goto(url);
    await expect(visitor.getByRole('heading', { name: 'This link is not available' })).toBeVisible();
    expect((await visitor.request.get(`${url}/pdf`)).status()).toBe(404);
    await anonymous.close();
  });
});

test('accounts, roles and agency isolation through the browser', async ({ page, browser }) => {
  const stamp = Date.now().toString(36);
  const password = () => randomBytes(12).toString('base64url');
  const ownerEmail = `owner-${stamp}@example.test`;
  const ownerPassword = password();
  const viewerEmail = `viewer-${stamp}@example.test`;

  async function signUp(p: Page, name: string, email: string, pw: string) {
    await p.getByLabel('Your name').fill(name);
    await p.getByLabel('Work email').fill(email);
    await p.getByLabel('Password').fill(pw);
    await p.getByRole('button', { name: 'Create account' }).click();
  }

  let clientUrl = '';
  let inviteUrl = '';
  await test.step('Sign up, create an agency and a client, import data', async () => {
    await page.goto('/clients');
    await expect(page).toHaveURL(/\/sign-in$/); // signed-out visitors cannot reach the workspace
    await page.goto('/sign-up');
    await signUp(page, 'Olive Owner', ownerEmail, ownerPassword);
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.getByLabel('Agency name').fill('Northfield Media');
    await page.getByRole('button', { name: 'Create agency' }).click();
    await expect(page.getByRole('heading', { name: 'Add your first client' })).toBeVisible();

    await page.getByRole('button', { name: 'New client' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Client name').fill('Harbour Bakery');
    await dialog.getByLabel('Currency').selectOption('EUR');
    await dialog.getByRole('button', { name: 'Create client' }).click();
    await expect(page.getByText('Harbour Bakery is ready')).toBeVisible();
    clientUrl = page.url().replace(/\/imports\/new.*$/, '');

    const hostile = '<img src=x onerror="window.__xss=1">';
    const rows = ['date,channel,campaign,currency,spend,impressions,clicks,conversions,revenue', `2026-11-01,Google Ads,"${hostile.replace(/"/g, '""')}",EUR,100,10000,200,10,500`, '2026-11-02,Google Ads,Brand,EUR,50,4000,90,4,210'];
    await chooseFile(page, { name: 'bakery.csv', mimeType: 'text/csv', buffer: Buffer.from(rows.join('\n')) }, 'Hand-made test file');
    await page.getByRole('button', { name: 'Check file and preview' }).click();
    await page.getByRole('button', { name: 'Continue to confirm' }).click();
    await page.getByRole('button', { name: 'Import 2 row(s)' }).click();
    await expect(page.getByText('Import complete: 2 row(s) written')).toBeVisible();

    // Imported text containing markup is displayed literally and never executed.
    await page.goto(`${clientUrl}/campaigns`);
    await expect(page.getByRole('link', { name: hostile })).toBeVisible();
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    await expect(page.getByText('€150.00').first()).toBeVisible();
  });

  await test.step('Owner invites a viewer', async () => {
    await page.goto('/team');
    await page.getByLabel('Email address').fill(viewerEmail);
    await page.getByLabel('Role', { exact: true }).selectOption('viewer');
    await page.getByRole('button', { name: 'Create invite link' }).click();
    inviteUrl = await page.getByLabel(/Invite link for/).inputValue();
    expect(inviteUrl).toMatch(/\/invite\/[\w-]{32}$/);
  });

  await test.step('A viewer can read but has no way to change anything', async () => {
    const context = await browser.newContext();
    const viewer = await context.newPage();
    await viewer.goto(inviteUrl);
    await expect(viewer.getByRole('heading', { name: 'Join Northfield Media' })).toBeVisible();
    await viewer.getByRole('link', { name: 'Create an account' }).click();
    await signUp(viewer, 'Vera Viewer', viewerEmail, password());
    await viewer.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(viewer.getByRole('link', { name: 'Harbour Bakery' })).toBeVisible();
    await expect(viewer.getByRole('button', { name: 'New client' })).toHaveCount(0);

    await viewer.goto(clientUrl);
    await expect(viewer.getByRole('heading', { level: 1, name: 'Harbour Bakery' })).toBeVisible();
    await expect(viewer.getByRole('link', { name: 'Import data' })).toHaveCount(0);
    await expect(viewer.getByRole('link', { name: 'Build report' })).toHaveCount(0);
    await viewer.goto(`${clientUrl}/imports/new`);
    await expect(viewer.getByRole('heading', { name: 'Your role cannot import data' })).toBeVisible();
    await viewer.goto(`${clientUrl}/settings`);
    await expect(viewer.getByText('Your role is read-only.')).toBeVisible();
    await expect(viewer.getByRole('button', { name: 'Save settings' })).toHaveCount(0);
    await expect(viewer.getByRole('button', { name: /Delete client/ })).toHaveCount(0);
    await viewer.goto('/team');
    await expect(viewer.getByText('Only agency owners can invite people or change roles.')).toBeVisible();
    await context.close();
  });

  await test.step('Another agency cannot open the client, even with its exact URL', async () => {
    const context = await browser.newContext();
    const outsider = await context.newPage();
    await outsider.goto('/sign-up');
    await signUp(outsider, 'Rival Owner', `rival-${stamp}@example.test`, password());
    await outsider.getByLabel('Agency name').fill('Rival Agency');
    await outsider.getByRole('button', { name: 'Create agency' }).click();
    await expect(outsider.getByRole('heading', { name: 'Add your first client' })).toBeVisible();
    for (const path of ['', '/campaigns', '/imports', '/reports', '/settings', '/pacing', '/investigate']) {
      // The page is streamed, so the HTTP status is 200; what matters is that nothing about the client is rendered.
      await outsider.goto(`${clientUrl}${path}`);
      await expect(outsider.getByRole('heading', { name: 'Page not found' })).toBeVisible();
      await expect(outsider.getByText('Harbour Bakery')).toHaveCount(0);
      expect(await outsider.content()).not.toContain('Harbour Bakery');
    }
    // Direct requests for another agency's report PDF are refused as well.
    const pdf = await outsider.request.get(`${clientUrl}/reports/00000000-0000-4000-8000-000000000000/pdf`);
    expect(pdf.status()).toBe(404);
    await context.close();
  });

  await test.step('Sign out, then sign in again', async () => {
    await sidebar(page).getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Explore the demo' })).toBeVisible();
    await page.goto('/sign-in');
    await page.getByLabel('Work email').fill(ownerEmail);
    await page.getByLabel('Password').fill('definitely-the-wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByLabel('Password').fill(ownerPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('link', { name: 'Harbour Bakery' })).toBeVisible();
  });
});

test.describe('mobile, 390px wide', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('pages fit the viewport; only tables scroll sideways', async ({ page }) => {
    await startDemo(page);
    const base = page.url();
    const noPageOverflow = async (label: string) => {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${label} scrolls horizontally by ${overflow}px`).toBeLessThanOrEqual(0);
    };
    await expect(page.getByRole('navigation', { name: 'Client workspace' }).last()).toBeVisible();
    await noPageOverflow('overview');
    await page.screenshot({ path: `${SHOTS}/07-mobile-overview.png` });
    for (const path of ['/campaigns', '/investigate', '/pacing', '/imports', '/imports/new', '/reports', '/settings']) {
      await page.goto(`${base}${path}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await noPageOverflow(path);
    }
    await page.goto(`${base}/reports`);
    await page.getByRole('link', { name: /October 2026 review/ }).click();
    await expect(page.getByRole('article', { name: /^Report:/ })).toBeVisible();
    await noPageOverflow('report');
    await page.goto('/team');
    await noPageOverflow('team');
  });
});

test('keyboard: skip link, dialog focus and Escape', async ({ page }) => {
  await startDemo(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.goto(`${page.url()}/pacing`);
  const trigger = page.getByRole('button', { name: 'Add budget' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Add a budget' });
  await expect(dialog).toBeVisible();
  // Focus moves into the dialog, and Escape closes it and returns focus to the trigger.
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  // Add a budget with the keyboard-reachable form, then see it paced.
  await trigger.click();
  await dialog.getByRole('radio', { name: 'One campaign' }).check();
  await dialog.getByLabel('Campaign', { exact: true }).selectOption({ label: 'Google Ads / Brand search' });
  await dialog.getByLabel(/Budget for the period/).fill('5000');
  await dialog.getByRole('button', { name: 'Add budget' }).click();
  await expect(page.getByRole('heading', { name: 'Google Ads / Brand search' })).toBeVisible();
  // An overlapping budget for the same scope is refused with a clear message.
  await trigger.click();
  await dialog.getByRole('radio', { name: 'One campaign' }).check();
  await dialog.getByLabel('Campaign', { exact: true }).selectOption({ label: 'Google Ads / Brand search' });
  await dialog.getByLabel(/Budget for the period/).fill('100');
  await dialog.getByRole('button', { name: 'Add budget' }).click();
  await expect(dialog.getByRole('alert')).toContainText('overlaps an existing budget');
});
