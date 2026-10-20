import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { colors, radius, tint } from '@/theme';
import { useI18n } from '@/i18n';

export interface PickerOption<T extends string | number> {
  value: T;
  label: string;
}

interface Props<T extends string | number> {
  visible: boolean;
  title: string;
  options: PickerOption<T>[];
  value?: T | null;
  onSelect: (value: T) => void;
  onClose: () => void;
}

/** Bottom-sheet list used by dropdowns (industry, bank, month, year…). */
export function PickerModal<T extends string | number>({ visible, title, options, value, onSelect, onClose }: Props<T>) {
  const { t } = useI18n();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityLabel={t('common.close')} className="flex-1 justify-end" style={{ backgroundColor: tint(colors.shadow, 0.35) }} onPress={onClose}>
        <Pressable className="bg-white" style={{ borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '70%', paddingTop: 16 }} onPress={() => undefined}>
          <View className="flex-row items-center justify-between px-6" style={{ paddingBottom: 8 }}>
            <Text variant="section" tone="primary-900">
              {title}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} hitSlop={12}>
              <Icon name="close" size={22} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
            {options.map((o) => {
              const selected = o.value === value;
              return (
                <Pressable
                  key={String(o.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    onSelect(o.value);
                    onClose();
                  }}
                  className={`flex-row items-center justify-between px-6 ${selected ? 'bg-primary-50' : ''}`}
                  style={{ minHeight: 48 }}
                >
                  <Text variant="body-lg" tone={selected ? 'primary-900' : 'neutral-900'} weight={selected ? 600 : 400}>
                    {o.label}
                  </Text>
                  {selected && <Icon name="check" size={18} color={colors.primary[900]} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
