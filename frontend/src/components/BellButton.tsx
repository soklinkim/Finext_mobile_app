import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from './Icon';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useNotificationCount } from '@/hooks/useNotificationCount';
import { listMissedDays } from '@/services/missedDays';
import { useReminders } from '@/services/reminders';
import { Text } from './Text';
import { useI18n } from '@/i18n';
import { colors, shadow } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

/** §6.1 — 40 px bell that opens Notifications, with a dot while there are undismissed notifications. */
export function BellButton() {
  const router = useRouter();
  const { t } = useI18n();
  const dark = useAppTheme();
  // Server notifications plus days with no entries (the latter work offline).
  const { data: missed } = useLocalQuery(() => listMissedDays(), []);
  const { unread } = useReminders();
  const count = useNotificationCount() + (missed?.length ?? 0) + unread;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? t('common.notificationsUnread', { count }) : t('common.notifications')}
      hitSlop={6}
      onPress={() => router.push('/notifications')}
      className="items-center justify-center rounded-pill"
      style={[{ width: 40, height: 40, backgroundColor: dark ? colors.dark.field : colors.white }, !dark && shadow.icon]}
    >
      <Icon name="bell" size={20} color={dark ? colors.dark.primary : undefined} />
      {count > 0 && (
        // A red number: everything the owner has not read yet (reminders, missed days and server notifications).
        <View
          style={{ position: 'absolute', top: 0, right: 0, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger, borderWidth: 1.5, borderColor: dark ? colors.dark.field : colors.white }}
        >
          <Text variant="micro" weight={700} tone="white" style={{ fontSize: 10, lineHeight: 12 }}>{count > 99 ? '99+' : String(count)}</Text>
        </View>
      )}
    </Pressable>
  );
}
