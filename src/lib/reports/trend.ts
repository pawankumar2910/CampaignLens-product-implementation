/**
 * Geometry for the static trend charts in reports. It is plain data, so the same
 * numbers draw the HTML preview (SVG) and the PDF (react-pdf SVG primitives).
 * One axis per chart; days without data are gaps.
 */
export interface TrendGeometry {
  width: number;
  height: number;
  plot: { left: number; right: number; top: number; bottom: number };
  yTicks: Array<{ y: number; value: number }>;
  xLabels: Array<{ x: number; index: number; anchor: 'start' | 'middle' | 'end' }>;
  /** SVG path data, one entry per run of consecutive days with data. */
  current: string[];
  previous: string[];
  /** Days with data that have no neighbour to connect to. */
  currentDots: Array<{ x: number; y: number }>;
  previousDots: Array<{ x: number; y: number }>;
}

function niceTop(max: number): { top: number; step: number } {
  if (!(max > 0)) return { top: 1, step: 0.5 };
  const rough = max / 3;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? rough;
  return { top: step * Math.ceil(max / step), step };
}

export function trendGeometry(current: Array<number | null>, previous: Array<number | null>, size: { width: number; height: number }): TrendGeometry {
  const plot = { left: 44, right: size.width - 8, top: 8, bottom: size.height - 20 };
  const n = current.length;
  const max = Math.max(0, ...current.map((v) => v ?? 0), ...previous.map((v) => v ?? 0));
  const { top, step } = niceTop(max);
  const x = (i: number) => plot.left + (n <= 1 ? (plot.right - plot.left) / 2 : (i / (n - 1)) * (plot.right - plot.left));
  const y = (v: number) => plot.bottom - (v / top) * (plot.bottom - plot.top);
  const round = (v: number) => Math.round(v * 10) / 10;

  const build = (values: Array<number | null>) => {
    const paths: string[] = [];
    const dots: Array<{ x: number; y: number }> = [];
    let run: number[] = [];
    const flush = () => {
      if (run.length === 1) dots.push({ x: round(x(run[0]!)), y: round(y(values[run[0]!]!)) });
      else if (run.length > 1) paths.push(run.map((i, k) => `${k ? 'L' : 'M'}${round(x(i))} ${round(y(values[i]!))}`).join(' '));
      run = [];
    };
    values.forEach((v, i) => {
      if (v === null) flush();
      else run.push(i);
    });
    flush();
    return { paths, dots };
  };
  const cur = build(current);
  const prev = build(previous);

  const labelIndexes = n <= 1 ? [0] : [...new Set([0, Math.round((n - 1) / 2), n - 1])];
  return {
    width: size.width,
    height: size.height,
    plot,
    yTicks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => ({ value: i * step, y: round(y(i * step)) })),
    xLabels: n === 0 ? [] : labelIndexes.map((index, k) => ({ index, x: round(x(index)), anchor: k === 0 ? 'start' : k === labelIndexes.length - 1 && n > 1 ? 'end' : 'middle' })),
    current: cur.paths,
    previous: prev.paths,
    currentDots: cur.dots,
    previousDots: prev.dots,
  };
}

/** Short axis label: 1500 -> "1.5k". Money is passed in currency units, not minor units. */
export function axisLabel(value: number, prefix = ''): string {
  if (value >= 1000) return `${prefix}${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return `${prefix}${Number.isInteger(value) ? value : value.toFixed(1)}`;
}

export const currencySymbol = (currency: string): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 }).format(0).replace(/[\d.,\s]/g, '');
