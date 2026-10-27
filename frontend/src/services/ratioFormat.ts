import type { RatioSnapshot } from '@/services/analysis';

/** Margins, expense ratio and growth as percentages; *_days in days; everything else as "times". */
function format(id: string, value: number): string {
  if (id.includes('margin') || id.includes('expense_ratio') || id === 'revenue_growth') return `${(value * 100).toFixed(1)}%`;
  if (id.endsWith('_days')) return `${value.toFixed(0)} days`;
  return `${value.toFixed(2)}x`;
}

export function formatRatio(ratio: RatioSnapshot): string {
  return ratio.value === null ? '—' : format(ratio.id, ratio.value);
}

export function formatBenchmark(ratio: RatioSnapshot): string {
  return format(ratio.id, ratio.benchmark);
}
