import { View } from 'react-native';
import { Text } from './Text';
import { formatMoneyWhole } from '@/services/bookkeeping';
import type { Statement, StatementLine } from '@/services/analysis';
import { colors } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

const COL = 76;

function columnHeaderLines(header: string): [string, string?] {
  const week = header.match(/^Week of (.+)$/);
  if (week) return ['Week of', week[1]];
  const yearToDate = header.match(/^Year to date (\d{4})$/);
  if (yearToDate) return ['Year to date', yearToDate[1]];
  const monthYear = header.match(/^(.+) (\d{4})$/);
  if (monthYear) return [monthYear[1], monthYear[2]];
  return [header];
}

function Row({ line, currency, twoCols }: { line: StatementLine; currency: Statement['currency']; twoCols: boolean }) {
  const dark = useAppTheme();
  const style = line.style ?? 'line';
  const fmt = (n: number) => formatMoneyWhole(n, currency, { showPlus: line.showPlus });
  const container =
    style === 'total'
      ? 'bg-primary-900 rounded-md'
      : style === 'subtotal'
        ? 'bg-primary-50 rounded-field'
        : 'border-b border-neutral-200';
  const emphasis = style !== 'line';
  return (
    <View className={`flex-row items-center ${container}`} style={{ minHeight: 36, marginHorizontal: emphasis ? -8 : 0, paddingHorizontal: emphasis ? 8 : 0, paddingVertical: 6, ...(dark && style === 'subtotal' ? { backgroundColor: colors.dark.surface } : {}) }}>
      <View className="flex-1" style={{ paddingLeft: emphasis ? 12 : 0, paddingRight: 8 }}>
        <Text variant="caption" weight={emphasis ? (style === 'total' ? 700 : 600) : 400} tone={style === 'total' ? 'white' : 'primary-900'} style={{ fontSize: 12 }}>
          {line.label}
        </Text>
      </View>
      <View style={{ width: COL, alignItems: 'flex-end' }}>
        <Text variant="caption" weight={style === 'total' ? 700 : emphasis ? 600 : 500} tone={style === 'total' ? 'white' : 'primary-900'} adjustsFontSizeToFit numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>
          {fmt(line.current)}
        </Text>
      </View>
      {twoCols && (
        <View style={{ width: COL, alignItems: 'flex-end' }}>
          {line.prior !== undefined && (
            <Text variant="caption" weight={400} tone={style === 'total' ? 'primary-200' : 'neutral-600'} adjustsFontSizeToFit numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>
              {fmt(line.prior)}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

/** §6.29 — label column + 76 px right-aligned value columns, subtotal and grand-total rows. Negatives keep their minus sign. */
export function StatementTable({ statement }: { statement: Statement }) {
  const twoCols = Boolean(statement.columnHeaders[1]);
  return (
    <View style={{ gap: 12 }}>
      <View className="flex-row" style={{ paddingHorizontal: 0 }}>
        <View className="flex-1" />
        {statement.columnHeaders.map((h, i) =>
          h ? (
            <View key={i} style={{ width: COL, minHeight: 34, alignItems: 'flex-end', justifyContent: 'flex-end' }}>
              {columnHeaderLines(h).map((part, line) => (
                <Text key={`${i}-${line}`} variant="micro" tone="neutral-600" numberOfLines={1} style={{ textAlign: 'right', lineHeight: 14 }}>
                  {part}
                </Text>
              ))}
            </View>
          ) : null,
        )}
      </View>
      {statement.sections.map((section, i) => (
        <View key={i} style={{ gap: 4 }}>
          {section.heading ? (
            <Text variant="caption" weight={600} tone="primary-500" style={{ marginTop: 8, marginBottom: 2 }}>
              {section.heading}
            </Text>
          ) : null}
          {section.lines.map((line) => (
            <Row key={line.key} line={line} currency={statement.currency} twoCols={twoCols} />
          ))}
        </View>
      ))}
    </View>
  );
}
