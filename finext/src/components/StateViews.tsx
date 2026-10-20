import { ActivityIndicator, View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { Button } from './Button';
import { colors } from '@/theme';
import { useI18n, type TKey } from '@/i18n';

export function LoadingState() {
  return (
    <View className="items-center justify-center" style={{ paddingVertical: 48 }} accessibilityRole="progressbar">
      <ActivityIndicator color={colors.primary[500]} />
    </View>
  );
}

export function EmptyState({ titleKey, bodyKey, icon = 'info' }: { titleKey: TKey; bodyKey?: TKey; icon?: 'info' | 'wifiOff' | 'search' }) {
  const { t } = useI18n();
  return (
    <View className="items-center" style={{ paddingVertical: 40, gap: 8 }}>
      <Icon name={icon} size={32} color={colors.primary[200]} />
      <Text variant="body-lg" tone="primary-900" style={{ textAlign: 'center' }}>
        {t(titleKey)}
      </Text>
      {bodyKey ? (
        <Text variant="body-sm" tone="neutral-600" style={{ textAlign: 'center' }}>
          {t(bodyKey)}
        </Text>
      ) : null}
    </View>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <View className="items-center" style={{ paddingVertical: 40, gap: 12 }}>
      <Text variant="body-lg" tone="danger" style={{ textAlign: 'center' }}>
        {t('state.error')}
      </Text>
      {onRetry && <Button variant="soft" label={t('state.retry')} onPress={onRetry} />}
    </View>
  );
}
