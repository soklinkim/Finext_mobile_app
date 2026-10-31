import { View } from 'react-native';
import { Button } from './Button';
import { Text } from './Text';
import { useI18n } from '@/i18n';
import { confirmAction } from '@/lib/confirm';
import { resetLocalLedger } from '@/services/auth';
import { countPendingSync } from '@/services/bookkeeping';

/**
 * Shown when this device still holds another account's offline data. Explains it, and lets the owner of this device erase
 * that data and carry on with the new account (after a confirmation that says what will be lost).
 */
export function LedgerConflictNotice({ onErased }: { onErased: () => void }) {
  const { t } = useI18n();

  const erase = async () => {
    const pending = await countPendingSync().catch(() => 0);
    const body = pending > 0 ? `${t('auth.eraseBody')}\n\n${t('auth.eraseUnsynced', { count: pending })}` : t('auth.eraseBody');
    confirmAction(t('auth.eraseTitle'), body, t('auth.eraseConfirm'), t('common.cancel'), () => {
      void resetLocalLedger().then(onErased);
    });
  };

  return (
    <View accessibilityLiveRegion="polite" className="bg-primary-50" style={{ borderRadius: 16, padding: 16, gap: 12 }}>
      <Text variant="body" weight={600} tone="primary-900">{t('auth.deviceOwnedTitle')}</Text>
      <Text variant="caption" tone="neutral-600">{t('auth.deviceOwnedBody')}</Text>
      <Button variant="primary" size="sm" label={t('auth.eraseConfirm')} onPress={() => { void erase(); }} />
    </View>
  );
}
