import { describe, expect, test } from 'vitest';
import { CsvStructureError, parseCsv } from '@/lib/import/csv';
import { suggestMapping, validateMapping } from '@/lib/import/mapping';
import { parseDecimal } from '@/lib/import/numbers';
import { planImport } from '@/lib/import/plan';
import { CANONICAL, HEADER, RAW, csv, day, normalize } from './helpers';

const errorsOf = (text: string) => normalize(text).issues.filter((i) => i.severity === 'error');

describe('CSV structure', () => {
  test('BOM, CRLF and quoted commas (ported from the starter)', () => {
    const r = normalize(`﻿${HEADER}\r\n${RAW.replace('Search', '"Brand, Search"')}\r\n`);
    expect(r.records[0]!.campaign).toBe('Brand, Search');
    expect(r.rejectedRows).toBe(0);
  });
  test('escaped quotes and newlines inside quotes (ported from the starter)', () => {
    const r = normalize(csv(RAW.replace('Search', '"A ""great""\nname"')));
    expect(r.records[0]!.campaign).toBe('A "great"\nname');
  });
  test('line numbers stay correct after a quoted newline', () => {
    const r = normalize(csv(RAW.replace('Search', '"two\nlines"'), RAW.replace('11-01', '02-30')));
    expect(r.issues.find((i) => i.code === 'invalid_date')!.line).toBe(4);
  });
  test.each([
    ['empty file', ''],
    ['header only', HEADER],
    ['unclosed quote', csv(RAW.replace('Search', '"Search'))],
    ['text after a closing quote', csv(RAW.replace('Search', '"Search"junk'))],
    ['duplicate header', `${HEADER},spend\n${RAW},1`],
    ['file over 5 MB', 'a'.repeat(5 * 1024 * 1024 + 1)],
  ])('rejects the whole file: %s', (_name, input) => {
    expect(() => parseCsv(input)).toThrow(CsvStructureError);
  });
  test('limits the row count', () => {
    expect(() => parseCsv(csv(...Array.from({ length: 20_001 }, () => RAW)))).toThrow(/20,000/);
  });
});

describe('row validation: nothing is dropped silently', () => {
  test('a valid canonical row normalizes to minor units', () => {
    const r = normalize(csv('2026-11-01,Google,Search,USD,19.99,10000,200,1.5,500.5'));
    expect(r.records).toEqual([{ line: 2, date: '2026-11-01', channel: 'Google', campaign: 'Search', spendCents: 1999, impressions: 10000, clicks: 200, conversions: 1.5, revenueCents: 50050 }]);
    expect(r.coverage).toEqual({ from: '2026-11-01', to: '2026-11-01' });
  });

  test.each([
    ['negative spend', csv(RAW.replace(',100,', ',-100,')), 'negative'],
    ['blank number', csv(RAW.replace(',100,', ',,')), 'missing'],
    ['invalid date', csv(RAW.replace('11-01', '02-30')), 'invalid_date'],
    ['non-finite number', csv(RAW.replace(',100,', ',Infinity,')), 'not_a_number'],
    ['clicks above impressions', csv(RAW.replace(',200,', ',20000,')), 'clicks_exceed_impressions'],
    ['fractional clicks', csv(RAW.replace(',200,', ',20.5,')), 'not_whole'],
    ['extra column', csv(`${RAW},extra`), 'column_count'],
    ['currency that is not the workspace currency', csv(RAW.replace('USD', 'XXX')), 'currency_mismatch'],
    ['blank campaign', csv(RAW.replace('Search', '')), 'missing'],
  ])('rejects the row with a located error: %s (ported from the starter)', (_name, input, code) => {
    const r = normalize(input);
    expect(r.records).toHaveLength(0);
    expect(r.rejectedRows).toBe(1);
    const e = r.issues.find((i) => i.severity === 'error')!;
    expect(e.code).toBe(code);
    expect(e.line).toBe(2);
    expect(e.message.length).toBeGreaterThan(10);
  });

  test('mixed currencies are never combined: only rows in the workspace currency pass', () => {
    const r = normalize(csv(RAW, RAW.replace('11-01', '11-02').replace('USD', 'INR')));
    expect(r.records).toHaveLength(1);
    expect(r.issues.filter((i) => i.code === 'currency_mismatch').map((i) => i.line)).toEqual([3]);
  });

  test('duplicate date/channel/campaign rejects every row sharing the key', () => {
    const r = normalize(csv(RAW, RAW.replace(',100,', ',150,'), RAW.replace('11-01', '11-02')));
    expect(r.records.map((x) => x.line)).toEqual([4]);
    expect(r.rejectedRows).toBe(2);
    expect(errorsOf(csv(RAW, RAW)).map((e) => [e.code, e.line])).toEqual([['duplicate_key', 2], ['duplicate_key', 3]]);
  });

  test('a good row next to a bad row: the good one is kept, the bad one is reported', () => {
    const r = normalize(csv(RAW, RAW.replace('11-01', '11-02').replace(',100,', ',abc,')));
    expect(r.records).toHaveLength(1);
    expect(r.rowsInFile).toBe(2);
    expect(r.rejectedRows).toBe(1);
    expect(r.rowsInFile).toBe(r.records.length + r.rejectedRows);
  });

  test('fractional attributed conversions are allowed (ported from the starter)', () => {
    expect(normalize(csv(RAW.replace(',10,500', ',1.5,500'))).records[0]!.conversions).toBe(1.5);
  });

  test('warnings do not reject rows', () => {
    const r = normalize(csv('2026-11-01,Google,Search,USD,"$1,234.50",10000,10,12,0'));
    expect(r.records[0]!.spendCents).toBe(123450);
    expect(r.issues.map((i) => i.code).sort()).toEqual(['cleaned_numbers', 'conversions_exceed_clicks']);
    expect(r.rejectedRows).toBe(0);
  });
});

describe('exact decimal parsing', () => {
  test('converts without floating point and rounds half-up', () => {
    expect(parseDecimal('19.99', 2)).toMatchObject({ ok: true, scaled: 1999, rounded: false });
    expect(parseDecimal('0.1', 2)).toMatchObject({ scaled: 10 });
    expect(parseDecimal('1.005', 2)).toMatchObject({ scaled: 101, rounded: true }); // 1.005 * 100 is 100.49999 in floating point
    expect(parseDecimal('2.675', 2)).toMatchObject({ scaled: 268 });
    expect(parseDecimal('1.00', 0, { whole: true })).toMatchObject({ ok: true, scaled: 1 });
    expect(parseDecimal('0.33333', 4)).toMatchObject({ scaled: 3333, rounded: true });
    expect(parseDecimal('₹1,00,000', 2)).toMatchObject({ ok: false, problem: 'not_a_number' }); // Indian digit grouping is not guessed
    expect(parseDecimal('1.234,56', 2)).toMatchObject({ ok: false, problem: 'not_a_number' }); // decimal commas are not guessed
    expect(parseDecimal('(5)', 2)).toMatchObject({ ok: false, problem: 'negative' });
    expect(parseDecimal(' ', 2)).toMatchObject({ ok: false, problem: 'missing' });
  });
});

describe('column mapping', () => {
  const googleHeaders = ['Day', 'Campaign', 'Currency code', 'Cost', 'Impr.', 'Clicks', 'Conversions', 'Conv. value'];
  test('suggests a mapping for a Google Ads style export', () => {
    const m = suggestMapping(googleHeaders);
    expect(m.columns).toEqual({ date: 'Day', campaign: 'Campaign', currency: 'Currency code', spend: 'Cost', impressions: 'Impr.', clicks: 'Clicks', conversions: 'Conversions', revenue: 'Conv. value' });
    expect(validateMapping(m, googleHeaders)).toEqual(['Map a Channel column or enter one channel name for the whole file.']);
  });
  test('suggests a mapping for a Meta Ads style export', () => {
    const m = suggestMapping(['Reporting starts', 'Campaign name', 'Amount spent (USD)', 'Impressions', 'Link clicks', 'Results', 'Purchases conversion value']);
    expect(m.columns).toMatchObject({ date: 'Reporting starts', campaign: 'Campaign name', spend: 'Amount spent (USD)', clicks: 'Link clicks', conversions: 'Results', revenue: 'Purchases conversion value' });
  });
  test('a fixed channel and a chosen date format normalize a platform export', () => {
    const text = `Day,Campaign,Cost,Impr.,Clicks,Conversions\n11/03/2026,Brand,"1,250.00",40000,900,31.5\n11/04/2026,Brand,980,38000,850,27`;
    const mapping = { ...suggestMapping(['Day', 'Campaign', 'Cost', 'Impr.', 'Clicks', 'Conversions']), fixedChannel: 'Google Ads', dateFormat: 'MM/DD/YYYY' as const };
    const r = normalize(text, mapping);
    expect(r.records.map((x) => [x.date, x.channel, x.spendCents, x.conversions, x.revenueCents])).toEqual([
      ['2026-11-03', 'Google Ads', 125000, 31.5, 0],
      ['2026-11-04', 'Google Ads', 98000, 27, 0],
    ]);
    expect(r.issues.map((i) => i.code).sort()).toEqual(['assumed_currency', 'cleaned_numbers', 'no_revenue']);
  });
  test('an incomplete mapping stops before any row is read', () => {
    const r = normalize(csv(RAW), { ...CANONICAL, columns: { ...CANONICAL.columns, spend: undefined } });
    expect(r.records).toHaveLength(0);
    expect(r.issues[0]).toMatchObject({ code: 'mapping', line: null });
  });
});

describe('repeat imports', () => {
  const existing = [day('2026-11-01', 'Google', 'Search', 100, 10000, 200, 10, 500)];
  test('identical rows are unchanged, new keys are inserted, differing values are conflicts', () => {
    const { records } = normalize(csv(RAW, RAW.replace('11-01', '11-02')));
    const plan = planImport(records, existing);
    expect(plan.unchanged.map((r) => r.date)).toEqual(['2026-11-01']);
    expect(plan.inserts.map((r) => r.date)).toEqual(['2026-11-02']);
    expect(plan.conflicts).toHaveLength(0);
  });
  test('a conflict names the fields that differ', () => {
    const { records } = normalize(csv(RAW.replace(',100,', ',120,').replace(',10,500', ',11,500')));
    const plan = planImport(records, existing);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]!.changed).toEqual(['spend', 'conversions']);
  });
});
