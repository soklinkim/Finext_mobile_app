import { ActivityIndicator, View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { Button } from './Button';
import { colors } from '@/theme';
import { useI18n, type TKey } from '@/i18n';
import { OnlineRequiredError, ServerUnreachableError } from '@/services/analysis/types';

/**
 * The sentence to show for a failed action: no internet, or the FINEXT server did not answer (in the owner's language),
 * else the server's own message. Never a raw network error ("Failed to fetch") or the API address.
 */
export function useErrorText(): (error: unknown) => string {
  const { t } = useI18n();
  return (error) => error instanceof ServerUnreachableError ? t('state.serverUnreachable')
    : error instanceof OnlineRequiredError ? t('state.needsInternet')
      : error instanceof Error && error.message ? error.message : t('state.error');
}

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

/**
 * Pass `error` to explain it: the device is offline, or online but the FINEXT server did not answer (a server or
 * network problem, not the user's connection), or the server's own message.
 */
export function ErrorState({ onRetry, message, onlineRequired = false, error }: { onRetry?: () => void; message?: string; onlineRequired?: boolean; error?: Error | null }) {
  const { t } = useI18n();
  const unreachable = error instanceof ServerUnreachableError;
  const offline = onlineRequired || (!unreachable && error instanceof OnlineRequiredError);
  const body = unreachable ? t('state.serverUnreachable') : offline ? t('accounting.onlineRequired') : message ?? error?.message;
  return (
    <View className="items-center" style={{ paddingVertical: 40, gap: 12 }}>
      <Text variant="body-lg" tone="danger" style={{ textAlign: 'center' }}>
        {t(unreachable ? 'state.serverUnreachableTitle' : 'state.error')}
      </Text>
      {body ? <Text variant="body-sm" tone="neutral-600" style={{ textAlign: 'center' }}>{body}</Text> : null}
      {onRetry && <Button variant="soft" label={t('state.retry')} onPress={onRetry} />}
    </View>
  );
}
