import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Text } from './Text';
import { useI18n } from '@/i18n';
import type { Statement, StatementLine } from '@/services/analysis';
import { paperMoney } from '@/services/statementPdf';
import { colors, shadow } from '@/theme';

/**
 * A statement drawn as a sheet of A4 paper, matching the PDF: black text on white in both themes, a formal heading,
 * one panel per period (side by side when the sheet is wide enough, stacked on a phone), small-caps section labels,
 * zero rows greyed, ruled subtotals and a double-ruled final total.
 */
const INK = '#111111';
const FAINT = '#A3A3A3';
const HAIRLINE = '#E6E6E6';
const A4 = 297 / 210;
const SIDE_BY_SIDE = 560; // sheet width at which Current and Prior fit next to each other

function Row({ line, value, currency }: { line: StatementLine; value: number | undefined; currency: Statement['currency'] }) {
  const { term } = useI18n();
  const style = line.style ?? 'line';
  const bold = style !== 'line';
  const color = style === 'line' && !value ? FAINT : INK;
  return (
    <View style={{
      flexDirection: 'row', gap: 8, paddingVertical: style === 'total' ? 7 : 5,
      borderBottomWidth: style === 'total' ? 3 : 1, borderBottomColor: style === 'total' ? INK : HAIRLINE,
      ...(style === 'subtotal' ? { borderTopWidth: 1, borderTopColor: INK } : {}),
      ...(style === 'total' ? { borderTopWidth: 1.5, borderTopColor: INK } : {}),
    }}>
      <Text variant="micro" weight={bold ? 700 : 400} style={{ flex: 1, color }}>{term(line.label)}</Text>
      <Text variant="micro" weight={bold ? 700 : 400} style={{ color, fontVariant: ['tabular-nums'] }}>
        {value === undefined ? '—' : paperMoney(value, currency)}
      </Text>
    </View>
  );
}

function Panel({ statement, index, label }: { statement: Statement; index: 0 | 1; label: string }) {
  const { term } = useI18n();
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={{ paddingBottom: 6, borderBottomWidth: 1.5, borderBottomColor: INK }}>
        <Text variant="micro" weight={700} style={{ color: INK }}>{label}</Text>
      </View>
      {statement.sections.map((section, i) => (
        <View key={i}>
          {section.heading ? (
            <Text variant="micro" weight={700} style={{ color: INK, fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase', paddingTop: 14, paddingBottom: 2 }}>
              {term(section.heading)}
            </Text>
          ) : null}
          {section.lines.map((line) => (
            <Row key={line.key} line={line} value={index === 0 ? line.current : line.prior} currency={statement.currency} />
          ))}
        </View>
      ))}
    </View>
  );
}

export function PaperStatement({ statement, business }: { statement: Statement; business: string }) {
  const { term } = useI18n();
  const [width, setWidth] = useState(0);
  const heading = statement.heading ?? [business, statement.title, statement.periodLabel];
  const periods = statement.columnHeaders.filter((h): h is string => Boolean(h));
  const sideBySide = width >= SIDE_BY_SIDE && periods.length > 1;
  return (
    <View
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      style={[{ backgroundColor: colors.white, borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 6, padding: 22, minHeight: width ? width * A4 : undefined, gap: 0 }, shadow.soft]}
    >
      <View accessibilityRole="header" style={{ gap: 2 }}>
        <Text variant="body-sm" weight={700} style={{ color: INK, textTransform: 'uppercase' }}>{heading[0]}</Text>
        {heading[1] ? <Text variant="body-lg" weight={700} style={{ color: INK, textTransform: 'uppercase' }}>{term(heading[1])}</Text> : null}
        {heading[2] ? <Text variant="caption" weight={600} style={{ color: INK, textTransform: 'uppercase' }}>{heading[2]}</Text> : null}
      </View>
      <View style={{ height: 1, backgroundColor: '#D4D4D4', marginTop: 14, marginBottom: 20 }} />
      <View style={{ flexDirection: sideBySide ? 'row' : 'column', gap: sideBySide ? 28 : 28 }}>
        {periods.map((period, index) => (
          <Panel key={index} statement={statement} index={index as 0 | 1} label={`${index === 0 ? 'Current' : 'Prior'} · ${period}`} />
        ))}
      </View>
      {statement.check ? (
        <Text variant="micro" style={{ color: '#666666', marginTop: 14 }}>
          {term(statement.check.label)}: {statement.check.difference === 0 ? 'difference 0' : paperMoney(statement.check.difference, statement.currency)}
        </Text>
      ) : null}
    </View>
  );
}
