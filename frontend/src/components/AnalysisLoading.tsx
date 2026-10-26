import { View } from 'react-native';
import { Text } from './Text';
import { colors, radius } from '@/theme';
import { useI18n } from '@/i18n';
import { useAppTheme } from '@/theme/AppTheme';

function Block({ width, height = 12, dark }: { width: number | `${number}%`; height?: number; dark: boolean }) {
  return <View style={{ width, height, borderRadius: 8, backgroundColor: dark ? colors.dark.field : colors.neutral[200] }} />;
}

export function AnalysisLoading({ mode }: { mode: 'performance' | 'health' }) {
  const dark = useAppTheme();
  const { t } = useI18n();
  const surface = dark ? colors.dark.surface : colors.primary[50];

  return (
    <View accessibilityRole="progressbar" accessibilityLabel={t('analysis.loading')} style={{ gap: 16 }}>
      <Text variant="caption" tone="neutral-600">{t('analysis.loading')}</Text>
      {mode === 'performance' ? (
        <>
          <View style={{ padding: 18, borderRadius: radius.card, backgroundColor: surface, gap: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Block width={142} height={16} dark={dark} />
              <View style={{ flexDirection: 'row', gap: 8 }}><Block width={30} height={30} dark={dark} /><Block width={30} height={30} dark={dark} /></View>
            </View>
            <View style={{ flexDirection: 'row', gap: 14 }}><Block width={54} dark={dark} /><Block width={62} dark={dark} /></View>
            <View style={{ height: 150, justifyContent: 'space-between' }}>
              {[0, 1, 2].map((line) => <View key={line} style={{ height: 1, backgroundColor: dark ? colors.dark.border : colors.neutral[200] }} />)}
              <View style={{ position: 'absolute', left: 0, right: 0, top: 5, bottom: 5, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around' }}>
                {[48, 76, 58, 104, 86, 65, 94].map((height, i) => (
                  <View key={i} style={{ height: '100%', flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
                    <Block width={7} height={height} dark={dark} />
                    <Block width={7} height={Math.max(24, 140 - height)} dark={dark} />
                  </View>
                ))}
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 9 }}>
            {[0, 1, 2].map((key) => <View key={key} style={{ flex: 1, height: 62, borderRadius: 14, backgroundColor: surface }} />)}
          </View>
        </>
      ) : (
        <>
          <View style={{ padding: 18, borderRadius: radius.card, backgroundColor: surface, gap: 12 }}>
            <Block width="58%" height={18} dark={dark} />
            <Block width="100%" height={10} dark={dark} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {[0, 1, 2].map((key) => <Block key={key} width={68} height={12} dark={dark} />)}
            </View>
          </View>
          {[0, 1, 2, 3].map((key) => (
            <View key={key} style={{ height: 84, padding: 15, borderRadius: radius.card, backgroundColor: dark ? colors.dark.surface : colors.white, borderWidth: 1, borderColor: dark ? colors.dark.border : colors.neutral[200], justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Block width={118} dark={dark} /><Block width={58} dark={dark} /></View>
              <Block width="100%" height={8} dark={dark} />
            </View>
          ))}
        </>
      )}
    </View>
  );
}
