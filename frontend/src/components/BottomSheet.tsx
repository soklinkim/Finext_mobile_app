import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { colors, radius, tint } from '@/theme';
import { useI18n } from '@/i18n';
import { useAppTheme } from '@/theme/AppTheme';

/** Bottom sheet with a title and a close button (same look as PickerModal), for short details and forms. */
export function BottomSheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n();
  const dark = useAppTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable accessibilityLabel={t('common.close')} className="flex-1 justify-end" style={{ backgroundColor: tint(colors.shadow, 0.35) }} onPress={onClose}>
          <Pressable style={{ borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '85%', paddingTop: 16, backgroundColor: dark ? colors.dark.background : colors.white }} onPress={() => undefined}>
            <View className="flex-row items-center justify-between px-6" style={{ paddingBottom: 8, gap: 12 }}>
              <Text variant="section" tone="primary-900" style={{ flex: 1 }} numberOfLines={1}>{title}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} hitSlop={12}>
                <Icon name="close" size={22} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32, gap: 14 }}>
              {children}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
