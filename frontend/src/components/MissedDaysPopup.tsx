import { popupCard } from '@/lib/layout';
import { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n } from '@/i18n';
import { dayKey, listMissedDays } from '@/services/missedDays';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

const SHOWN_KEY = 'finext.missedPopupDay';

/** A reminder pop-up, at most once a day, when there are days with no record. "Review days" opens the missing-records filter. */
export function MissedDaysPopup() {
  const { t } = useI18n();
  const dark = useAppTheme();
  const router = useRouter();
  const { data: missed } = useLocalQuery(() => listMissedDays(), []);
  const [open, setOpen] = useState(false);
  const count = missed?.length ?? 0;

  useEffect(() => {
    if (!count) return;
    let active = true;
    void AsyncStorage.getItem(SHOWN_KEY).then((last) => {
      if (active && last !== dayKey(Date.now())) setOpen(true);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [count > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    setOpen(false);
    void AsyncStorage.setItem(SHOWN_KEY, dayKey(Date.now())).catch(() => undefined);
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ ...popupCard, width: '100%', gap: 12, padding: 20, borderRadius: radius.card, backgroundColor: dark ? colors.dark.surface : colors.white }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger }} />
          <Text variant="title" weight={700} tone="primary-900">{t('missed.popupTitle')}</Text>
          <Text variant="body-sm" tone="neutral-600">{t('missed.popupBody', { count })}</Text>
          <Button label={t('missed.popupReview')} onPress={() => { close(); router.push({ pathname: '/transactions', params: { filter: 'missing' } }); }} />
          <Pressable accessibilityRole="button" onPress={close} hitSlop={8} style={{ alignItems: 'center', paddingVertical: 6 }}>
            <Text variant="body-sm" weight={600} tone="primary-500">{t('missed.popupLater')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
