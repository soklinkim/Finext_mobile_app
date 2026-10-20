import { View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { colors, tint } from '@/theme';
import { useI18n } from '@/i18n';
import { formatUpdated } from '@/lib/format';

/** "Offline · last updated …" — shown on analysis screens whenever cached data is displayed. */
export function OfflineBanner({ fetchedAt }: { fetchedAt?: number }) {
  const { t, locale } = useI18n();
  return (
    <View
      accessibilityRole="alert"
      className="flex-row items-center rounded-lg"
      style={{ backgroundColor: tint(colors.alert, 0.15), paddingHorizontal: 14, paddingVertical: 10, gap: 8, marginBottom: 16 }}
    >
      <Icon name="wifiOff" size={16} />
      <Text variant="caption" tone="primary-900" style={{ flex: 1 }}>
        {fetchedAt ? t('offline.banner', { time: formatUpdated(fetchedAt, locale) }) : t('offline.bannerNoTime')}
      </Text>
    </View>
  );
}
