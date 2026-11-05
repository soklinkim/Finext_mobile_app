import { View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { Text } from './Text';
import { useI18n } from '@/i18n';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

export interface FormulaPart {
  label: string;
  value: string;
}

/** What a tapped number shows: the result, the formula in words, and the figures it was worked out from. */
export interface FormulaInfo {
  title: string;
  result: string;
  /** e.g. "Gross profit = Revenue + Cost of goods sold" */
  formula: string;
  /** the same formula with this period's figures put in, e.g. "= USD 120 + USD 80" */
  withNumbers?: string;
  /** the figures used, in order */
  parts?: FormulaPart[];
  /** the same thing in plain words */
  explanation?: string;
  note?: string;
}

/** Bottom sheet that shows how a number was worked out, so the owner can see where it comes from. */
export function FormulaSheet({ info, onClose }: { info: FormulaInfo | null; onClose: () => void }) {
  const { t } = useI18n();
  const dark = useAppTheme();
  const box = { padding: 14, borderRadius: radius.card, gap: 6, backgroundColor: dark ? colors.dark.field : colors.primary[50] } as const;
  return (
    <BottomSheet visible={info !== null} title={info?.title ?? ''} onClose={onClose}>
      {info && (
        <>
          <Text variant="amount-xl" weight={700} tone="primary-900">{info.result}</Text>
          {info.explanation ? (
            <View style={box}>
              <Text variant="micro" weight={700} tone="neutral-600">{t('formula.words')}</Text>
              <Text variant="body-sm" tone="neutral-900">{info.explanation}</Text>
            </View>
          ) : null}
          <View style={box}>
            <Text variant="micro" weight={700} tone="neutral-600">{t('formula.how')}</Text>
            <Text variant="body-sm" weight={600} tone="primary-900">{info.formula}</Text>
            {info.withNumbers && !(info.parts && info.parts.length > 0) ? <Text variant="body-sm" weight={600} tone="primary-900" style={{ fontVariant: ['tabular-nums'] }}>{info.withNumbers}</Text> : null}
          </View>
          {info.parts && info.parts.length > 0 && (
            <View style={{ gap: 4 }}>
              <Text variant="micro" weight={700} tone="neutral-600">{t('formula.source')}</Text>
              {info.parts.map((part, index) => (
                <View key={`${part.label}-${index}`} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: dark ? colors.dark.border : colors.neutral[200] }}>
                  <Text variant="body-sm" tone="neutral-900" style={{ flex: 1 }}>{part.label}</Text>
                  <Text variant="body-sm" weight={600} tone="primary-900" style={{ fontVariant: ['tabular-nums'] }}>{part.value}</Text>
                </View>
              ))}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6 }}>
                <Text variant="body-sm" weight={700} tone="primary-900" style={{ flex: 1 }}>= {info.title}</Text>
                <Text variant="body-sm" weight={700} tone="primary-900" style={{ fontVariant: ['tabular-nums'] }}>{info.result}</Text>
              </View>
            </View>
          )}
          {info.note ? <Text variant="caption" tone="neutral-600">{info.note}</Text> : null}
        </>
      )}
    </BottomSheet>
  );
}
