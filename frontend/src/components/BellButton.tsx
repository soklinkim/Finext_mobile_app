import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from './Icon';
import { useNotificationCount } from '@/hooks/useNotificationCount';
import { useI18n } from '@/i18n';
import { colors } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

/** §6.1 — 32 px bell that opens Notifications, with a dot while there are undismissed notifications. */
export function BellButton() {
  const router = useRouter();
  const { t } = useI18n();
  const dark = useAppTheme();
  const count = useNotificationCount();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? t('common.notificationsUnread', { count }) : t('common.notifications')}
      hitSlop={6}
      onPress={() => router.push('/notifications')}
      className="items-center justify-center rounded-pill"
      style={{ width: 32, height: 32, backgroundColor: dark ? colors.dark.field : colors.white }}
    >
      <Icon name="bell" size={18} color={dark ? colors.dark.primary : undefined} />
      {count > 0 && (
        <View
          style={{ position: 'absolute', top: 5, right: 6, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.danger, borderWidth: 1.5, borderColor: dark ? colors.dark.field : colors.white }}
        />
      )}
    </Pressable>
  );
}
