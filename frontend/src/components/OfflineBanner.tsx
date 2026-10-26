import { View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { colors, tint } from '@/theme';
import { useI18n } from '@/i18n';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { formatUpdated } from '@/lib/format';
import { countPendingSync } from '@/services/bookkeeping';

/**
 * "Offline · last updated …" — shown on analysis screens whenever cached data is displayed.
 * Reports are calculated on the server, so entries recorded offline (still pending sync)
 * are not in them yet; say how many so the numbers aren't mistaken for current ones.
 */
export function OfflineBanner({ fetchedAt }: { fetchedAt?: number }) {
  const { t, locale } = useI18n();
  const { data: pending = 0 } = useLocalQuery(countPendingSync, []);
  return (
    <View
      accessibilityRole="alert"
      className="flex-row rounded-lg"
      style={{ backgroundColor: tint(colors.alert, 0.15), paddingHorizontal: 14, paddingVertical: 10, gap: 8, marginBottom: 16 }}
    >
      <View style={{ paddingTop: 1 }}>
        <Icon name="wifiOff" size={16} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="caption" tone="primary-900">
          {fetchedAt ? t('offline.banner', { time: formatUpdated(fetchedAt, locale) }) : t('offline.bannerNoTime')}
        </Text>
        {pending > 0 && (
          <Text variant="micro" tone="neutral-600">
            {t(pending === 1 ? 'offline.pendingOne' : 'offline.pendingMany', { count: pending })}
          </Text>
        )}
      </View>
    </View>
  );
}
