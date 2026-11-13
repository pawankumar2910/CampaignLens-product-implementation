/**
 * Exact decimal parsing for imported cells. Values are converted to scaled
 * integers with string arithmetic, so "19.99" becomes 1999 cents with no
 * floating-point step. Extra decimals are rounded half-up and reported.
 */
export type NumberProblem = 'missing' | 'negative' | 'not_a_number' | 'not_whole' | 'too_large';

export type ParsedNumber =
  | { ok: true; scaled: number; /** symbols or thousands separators were removed */ cleaned: boolean; /** precision beyond the scale was rounded */ rounded: boolean }
  | { ok: false; problem: NumberProblem };

const MAX_UNITS = 1e11; // 100 billion units; far above any real campaign-day value

export function parseDecimal(raw: string, scale: number, opts: { whole?: boolean } = {}): ParsedNumber {
  let s = raw.trim();
  if (s === '' || s === '-' || s === '--' || /^(n\/?a|null)$/i.test(s)) return { ok: false, problem: 'missing' };
  let cleaned = false;

  if (/^\(.*\)$/.test(s) || /^[-−]/.test(s)) return { ok: false, problem: 'negative' };
  const stripped = s.replace(/^(?:[$€£₹]|[A-Z]{3}\s)\s*/u, '').replace(/\s*%$/, '');
  if (stripped !== s) {
    cleaned = true;
    s = stripped.trim();
  }
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    cleaned = true;
    s = s.replace(/,/g, '');
  }
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) return { ok: false, problem: 'not_a_number' };

  const [intPart = '0', fracPart = ''] = s.split('.');
  if (Number(intPart || '0') > MAX_UNITS) return { ok: false, problem: 'too_large' };
  const kept = fracPart.slice(0, scale).padEnd(scale, '0');
  const rest = fracPart.slice(scale);
  const rounded = /[1-9]/.test(rest);
  if (opts.whole && /[1-9]/.test(fracPart)) return { ok: false, problem: 'not_whole' };
  let scaled = Number(intPart || '0') * 10 ** scale + Number(kept || '0');
  if (rest.length && rest[0]! >= '5') scaled += 1;
  return { ok: true, scaled, cleaned, rounded };
}
