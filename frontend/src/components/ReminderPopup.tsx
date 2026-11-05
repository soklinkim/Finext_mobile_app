import { useEffect, useRef } from 'react';
import { AppState, Modal, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { useI18n } from '@/i18n';
import { checkDueReminders, markNoticeRead, formatTime12, markNoticesPopped, useReminders, type ReminderNotice } from '@/services/reminders';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

/**
 * Watches the owner's reminders while the app is open (and when it comes back to the front). A reminder that falls due
 * opens this pop-up; "Add entry" goes straight to the Add entry form.
 */
export function ReminderPopup() {
  const { t } = useI18n();
  const dark = useAppTheme();
  const router = useRouter();
  const { notices } = useReminders();
  const busy = useRef(false);

  useEffect(() => {
    const check = () => {
      if (busy.current) return;
      busy.current = true;
      void checkDueReminders().finally(() => { busy.current = false; });
    };
    check();
    const timer = setInterval(check, 30 * 1000);
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') check(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, []);

  // The newest notice that has not been shown yet; closing the pop-up marks it shown, so the next one (if any) follows.
  const shown: ReminderNotice | null = notices.filter((n) => !n.popped && !n.read).sort((a, b) => b.at - a.at)[0] ?? null;

  const close = () => {
    void markNoticesPopped(notices.filter((n) => !n.popped).map((n) => n.id));
  };
  const open = () => {
    if (shown) void markNoticeRead(shown.id);
    void markNoticesPopped(notices.filter((n) => !n.popped).map((n) => n.id));
    router.push('/add-entry');
  };
  const time = shown ? formatTime12(new Date(shown.at).getHours(), new Date(shown.at).getMinutes(), t('reminder.am'), t('reminder.pm')) : '';

  return (
    <Modal visible={shown !== null} transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ alignSelf: 'stretch', gap: 12, padding: 20, borderRadius: radius.card, backgroundColor: dark ? colors.dark.surface : colors.white }}>
          <Text variant="title" weight={700} tone="primary-900">{t('reminder.popupTitle')}</Text>
          <Text variant="body-sm" tone="neutral-600">{t('reminder.popupBody', { time })}</Text>
          <Button label={t('reminder.popupOpen')} icon="plus" onPress={open} />
          <Pressable accessibilityRole="button" onPress={close} hitSlop={8} style={{ alignItems: 'center', paddingVertical: 6 }}>
            <Text variant="body-sm" weight={600} tone="primary-500">{t('missed.popupLater')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
