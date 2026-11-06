import { useState } from 'react';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Button } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';
import { sheetPanel } from '@/lib/layout';
import { colors, radius, tint } from '@/theme';
import { useI18n } from '@/i18n';
import { useAppTheme } from '@/theme/AppTheme';

export interface MultiOption {
  value: string;
  label: string;
}

interface Props {
  title: string;
  options: MultiOption[];
  /** the chosen values; empty means "everything" */
  value: string[];
  onChange: (value: string[]) => void;
  /** words for the empty choice ("All") */
  allLabel: string;
  /** summary when several are chosen, e.g. "3 categories" */
  manyLabel: (count: number) => string;
  searchable?: boolean;
}

/** A drop-down where several options can be ticked. Nothing ticked means All, so "All" clears the others. */
export function MultiSelectField({ title, options, value, onChange, allLabel, manyLabel, searchable }: Props) {
  const { t } = useI18n();
  const dark = useAppTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const close = () => { setOpen(false); setQuery(''); };
  const needle = query.trim().toLowerCase();
  const shown = searchable && needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  const summary = value.length === 0 ? allLabel : value.length === 1 ? (options.find((o) => o.value === value[0])?.label ?? allLabel) : manyLabel(value.length);
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  const row = (key: string, label: string, selected: boolean, onPress: () => void) => (
    <Pressable key={key} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onPress}
      className="flex-row items-center justify-between px-6" style={{ minHeight: 48, backgroundColor: selected ? (dark ? colors.dark.field : colors.primary[50]) : undefined }}>
      <Text variant="body-lg" tone={selected ? 'primary-900' : 'neutral-900'} weight={selected ? 600 : 400}>{label}</Text>
      <Icon name={selected ? 'checkSquare' : 'square'} size={20} color={selected ? colors.primary[900] : colors.neutral[500]} />
    </Pressable>
  );

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`${title}: ${summary}`} onPress={() => setOpen(true)}
        className="flex-row items-center justify-between rounded-lg"
        style={{ minHeight: 40, paddingHorizontal: 14, paddingVertical: 8, gap: 6, backgroundColor: dark ? colors.dark.field : colors.primary[50] }}>
        <Text variant="body" weight={500} tone="primary-900" numberOfLines={1} style={{ flexShrink: 1 }}>{summary}</Text>
        <Icon name="chevronDown" size={16} color={dark ? colors.dark.primary : colors.primary[500]} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => close()} statusBarTranslucent>
        <Pressable accessibilityLabel={t('common.close')} className="flex-1 justify-end" style={{ backgroundColor: tint(colors.shadow, 0.35) }} onPress={() => close()}>
          <Pressable style={{ ...sheetPanel, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '75%', paddingTop: 16, backgroundColor: dark ? colors.dark.background : colors.white }} onPress={() => undefined}>
            <View className="flex-row items-center justify-between px-6" style={{ paddingBottom: 8 }}>
              <Text variant="section" tone="primary-900">{title}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => close()} hitSlop={12}>
                <Icon name="close" size={22} />
              </Pressable>
            </View>
            {searchable && (
              <View className="px-6" style={{ paddingBottom: 8 }}>
                <TextInput value={query} onChangeText={setQuery} placeholder={t('common.search')} placeholderTextColor={colors.neutral[500]} accessibilityLabel={t('common.search')} autoCorrect={false}
                  style={{ height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: dark ? colors.dark.field : colors.primary[50], color: dark ? colors.dark.text : colors.neutral[900] }} />
              </View>
            )}
            <ScrollView keyboardShouldPersistTaps="handled">
              {!needle && row('__all', allLabel, value.length === 0, () => onChange([]))}
              {shown.map((o) => row(o.value, o.label, value.includes(o.value), () => toggle(o.value)))}
            </ScrollView>
            <View className="px-6" style={{ paddingVertical: 14 }}>
              <Button label={t('overview.apply')} onPress={() => close()} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
