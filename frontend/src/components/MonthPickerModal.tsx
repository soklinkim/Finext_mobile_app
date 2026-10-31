import { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Button } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';
import { colors, radius, tint } from '@/theme';
import { useI18n } from '@/i18n';
import { MONTHS, MONTHS_SHORT } from '@/lib/format';
import { useAppTheme } from '@/theme/AppTheme';

/** A month is identified as year * 12 + month (month 0-11), so months from different years sort and compare as plain numbers. */
export const monthKey = (year: number, month: number) => year * 12 + month;

/** "November 2026", "August - November 2026" for a run of months, or "3 months" when they are not next to each other. */
export function describeMonths(keys: number[], locale: 'en-GB' | 'km', count: (n: number) => string): string {
  const sorted = [...keys].sort((a, b) => a - b);
  const name = (k: number) => MONTHS[locale][k % 12];
  const year = (k: number) => Math.floor(k / 12);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (sorted.length === 1) return `${name(first)} ${year(first)}`;
  if (last - first + 1 !== sorted.length) return count(sorted.length);
  return year(first) === year(last) ? `${name(first)} - ${name(last)} ${year(last)}` : `${name(first)} ${year(first)} - ${name(last)} ${year(last)}`;
}

interface Props {
  visible: boolean;
  title: string;
  /** selected month keys */
  value: number[];
  onChange: (keys: number[]) => void;
  onClose: () => void;
}

/** Month calendar: pick a year with the arrows, tap months to select or unselect them (several at once). Future months are disabled. */
export function MonthPickerModal({ visible, title, value, onChange, onClose }: Props) {
  const { t, locale } = useI18n();
  const dark = useAppTheme();
  const now = new Date();
  const nowKey = monthKey(now.getFullYear(), now.getMonth());
  const [draft, setDraft] = useState<number[]>(value);
  const [year, setYear] = useState(now.getFullYear());

  // Start from the current selection each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setDraft(value);
    setYear(value.length ? Math.floor(Math.max(...value) / 12) : now.getFullYear());
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key: number) => setDraft((old) => (old.includes(key) ? old.filter((k) => k !== key) : [...old, key]));
  const selectedHere = draft.filter((k) => Math.floor(k / 12) === year).length;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityLabel={t('common.close')} className="flex-1 items-center justify-center px-6" style={{ backgroundColor: tint(colors.shadow, 0.35) }} onPress={onClose}>
        <Pressable style={{ width: '100%', maxWidth: 420, borderRadius: radius.lg, padding: 20, gap: 14, backgroundColor: dark ? colors.dark.background : colors.white }} onPress={() => undefined}>
          <View className="flex-row items-center justify-between">
            <Text variant="section" tone="primary-900">{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} hitSlop={12}>
              <Icon name="close" size={22} />
            </Pressable>
          </View>

          <View className="flex-row items-center justify-between">
            <Pressable accessibilityRole="button" accessibilityLabel={String(year - 1)} onPress={() => setYear((y) => y - 1)} hitSlop={10} style={{ padding: 6 }}>
              <Icon name="chevronLeft" size={20} />
            </Pressable>
            <Text variant="body-lg" weight={600} tone="primary-900">
              {year}{selectedHere ? ` · ${selectedHere}` : ''}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={String(year + 1)} disabled={year >= now.getFullYear()} onPress={() => setYear((y) => y + 1)} hitSlop={10} style={{ padding: 6, opacity: year >= now.getFullYear() ? 0.3 : 1 }}>
              <Icon name="chevronRight" size={20} />
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {MONTHS_SHORT[locale].map((label, m) => {
              const key = monthKey(year, m);
              const selected = draft.includes(key);
              const future = key > nowKey;
              return (
                <Pressable
                  key={m}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected, disabled: future }}
                  accessibilityLabel={`${label} ${year}`}
                  disabled={future}
                  onPress={() => toggle(key)}
                  style={{
                    width: '31.5%',
                    height: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 22,
                    opacity: future ? 0.35 : 1,
                    backgroundColor: selected ? colors.primary[900] : dark ? colors.dark.field : colors.primary[50],
                    borderWidth: key === nowKey && !selected ? 1 : 0,
                    borderColor: colors.primary[500],
                  }}
                >
                  <Text variant="body" weight={selected ? 600 : 400} tone={selected ? 'white' : 'primary-900'}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View className="flex-row" style={{ gap: 12 }}>
            <View style={{ flexShrink: 0 }}>
              <Button variant="soft" label={t('overview.thisMonth')} onPress={() => { setDraft([nowKey]); setYear(now.getFullYear()); }} />
            </View>
            <View style={{ flex: 1 }}>
              <Button className="w-full" label={t('overview.apply')} disabled={draft.length === 0} onPress={() => { onChange([...draft].sort((a, b) => a - b)); onClose(); }} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
