import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from './Icon';
import { PickerModal } from './PickerModal';
import { Text } from './Text';
import { colors } from '@/theme';
import { useI18n } from '@/i18n';
import { MONTHS, WEEKDAYS, sameDay } from '@/lib/format';

interface Props {
  year: number;
  month: number; // 0-based
  onMonthChange: (year: number, month: number) => void;
  selected: Date | null;
  onSelect: (date: Date) => void;
  /** days of this month that have transactions get a small dot */
  activeDays?: number[];
}

/** §6.13 — month/year dropdowns, Monday-first 7-column grid, selected = 36 px primary-900 circle, today = 1 px ring. */
export function CalendarGrid({ year, month, onMonthChange, selected, onSelect, activeDays = [] }: Props) {
  const { locale, t } = useI18n();
  const [picker, setPicker] = useState<'month' | 'year' | null>(null);
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows = Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7));
  const today = new Date();
  const thisYear = today.getFullYear();

  return (
    <View style={{ gap: 12 }}>
      <View className="flex-row items-center justify-between">
        <Pressable accessibilityRole="button" accessibilityLabel={t('calendar.month')} onPress={() => setPicker('month')} className="flex-row items-center" style={{ gap: 4, minHeight: 44 }}>
          <Text variant="body-lg" weight={400} tone="primary-200">
            {MONTHS[locale][month]}
          </Text>
          <Icon name="chevronDown" size={16} color={colors.primary[200]} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('calendar.year')} onPress={() => setPicker('year')} className="flex-row items-center" style={{ gap: 4, minHeight: 44 }}>
          <Text variant="body-lg" weight={400} tone="primary-200">
            {year}
          </Text>
          <Icon name="chevronDown" size={16} color={colors.primary[200]} />
        </Pressable>
      </View>
      <View className="flex-row">
        {WEEKDAYS[locale].map((w) => (
          <View key={w} className="flex-1 items-center">
            <Text variant="caption" weight={400} tone="primary-500">
              {w}
            </Text>
          </View>
        ))}
      </View>
      {rows.map((row, r) => (
        <View key={r} className="flex-row" style={{ height: 40 }}>
          {row.map((d, c) => {
            if (!d) return <View key={c} className="flex-1" />;
            const date = new Date(year, month, d);
            const isSel = selected ? sameDay(selected, date) : false;
            const isToday = sameDay(today, date);
            return (
              <Pressable key={c} accessibilityRole="button" accessibilityState={{ selected: isSel }} accessibilityLabel={`${d} ${MONTHS[locale][month]} ${year}`} onPress={() => onSelect(date)} className="flex-1 items-center justify-center">
                <View
                  className={`items-center justify-center ${isSel ? 'bg-primary-900' : ''}`}
                  style={{ width: 36, height: 36, borderRadius: 18, borderWidth: isToday && !isSel ? 1 : 0, borderColor: colors.primary[500] }}
                >
                  <Text variant="body" weight={400} tone={isSel ? 'white' : 'neutral-900'}>
                    {d}
                  </Text>
                  {activeDays.includes(d) && !isSel && <View style={{ position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent.expense }} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      <PickerModal
        visible={picker === 'month'}
        title={t('calendar.month')}
        options={MONTHS[locale].map((label, i) => ({ value: i, label }))}
        value={month}
        onSelect={(m) => onMonthChange(year, m)}
        onClose={() => setPicker(null)}
      />
      <PickerModal
        visible={picker === 'year'}
        title={t('calendar.year')}
        options={Array.from({ length: 11 }, (_, i) => thisYear - 8 + i).map((y) => ({ value: y, label: String(y) }))}
        value={year}
        onSelect={(y) => onMonthChange(y, month)}
        onClose={() => setPicker(null)}
      />
    </View>
  );
}
