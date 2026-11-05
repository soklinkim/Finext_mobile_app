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
  /** days with no entries that the owner has not answered: red number and dot */
  missedDays?: number[];
  /** days filled with an average: green like a recorded day, with a "~" */
  estimatedDays?: number[];
  /** days the owner confirmed nothing happened: yellow */
  zeroDays?: number[];
  /** a chosen span of days (both ends marked, the days between tinted); used instead of `selected` */
  range?: { from: number | null; to: number | null };
}

/** Calendar status colours: recorded = green, nothing happened = yellow, missing = red (a soft fill, readable under the number). */
const TINT = { recorded: '#52D5BA40', zero: '#FFAF2A59', missed: '#FF426740' } as const;

/** §6.13 — month/year dropdowns, Monday-first 7-column grid, selected = 36 px primary-900 circle, today = 1 px ring. */
export function CalendarGrid({ year, month, onMonthChange, selected, onSelect, activeDays = [], missedDays = [], estimatedDays = [], zeroDays = [], range }: Props) {
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
  const onToday = selected ? sameDay(selected, today) : false;
  const goToToday = () => {
    onMonthChange(thisYear, today.getMonth());
    onSelect(new Date(thisYear, today.getMonth(), today.getDate()));
  };

  return (
    <View style={{ gap: 12 }}>
      <View className="flex-row items-center">
        <View className="flex-row items-center" style={{ gap: 12 }}>
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
        {/* Shown whenever another day is selected, so the way back to today is one tap. */}
        {!onToday && (
          <Pressable accessibilityRole="button" accessibilityLabel={t('calendar.today')} onPress={goToToday} hitSlop={8} className="items-center justify-center rounded-pill bg-primary-50" style={{ marginLeft: 'auto', paddingHorizontal: 12, minHeight: 32 }}>
            <Text variant="caption" weight={600} tone="primary-900">{t('calendar.today')}</Text>
          </Pressable>
        )}
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
            const atStart = range?.from != null && sameDay(new Date(range.from), date);
            const atEnd = range?.to != null && sameDay(new Date(range.to), date);
            const spanning = range?.from != null && range?.to != null && range.from < range.to && !sameDay(new Date(range.from), new Date(range.to));
            const inSpan = spanning && date.getTime() >= new Date(new Date(range!.from!).setHours(0, 0, 0, 0)).getTime() && date.getTime() <= range!.to!;
            const isSel = (selected ? sameDay(selected, date) : false) || atStart || atEnd;
            const isToday = sameDay(today, date);
            const missed = missedDays.includes(d);
            const estimated = estimatedDays.includes(d);
            const zero = zeroDays.includes(d);
            const recorded = activeDays.includes(d) || estimated;
            const fill = missed ? TINT.missed : zero && !recorded ? TINT.zero : recorded ? TINT.recorded : null;
            const status = missed ? t('missed.legendMissed') : zero && !recorded ? t('missed.legendZero') : estimated ? t('missed.legendEstimate') : recorded ? t('missed.legendRecorded') : '';
            const label = `${d} ${MONTHS[locale][month]} ${year}${status ? `, ${status}` : ''}`;
            return (
              <Pressable key={c} accessibilityRole="button" accessibilityState={{ selected: isSel }} accessibilityLabel={label} onPress={() => onSelect(date)} className="flex-1 items-center justify-center">
                {/* The span: one band from the first day to the last, rounded where it starts, ends or wraps to a new week. */}
                {inSpan && (
                  <View pointerEvents="none" style={{
                    position: 'absolute', top: 2, bottom: 2,
                    left: atStart ? '50%' : 0, right: atEnd ? '50%' : 0,
                    backgroundColor: colors.primary[200],
                    borderTopLeftRadius: atStart || c === 0 || d === 1 ? 18 : 0, borderBottomLeftRadius: atStart || c === 0 || d === 1 ? 18 : 0,
                    borderTopRightRadius: atEnd || c === 6 || d === days ? 18 : 0, borderBottomRightRadius: atEnd || c === 6 || d === days ? 18 : 0,
                  }} />
                )}
                <View
                  className={`items-center justify-center ${isSel ? 'bg-primary-900' : ''}`}
                  style={{ width: 36, height: 36, borderRadius: 18, borderWidth: isSel && range ? 2 : isToday && !isSel ? 1 : 0, borderColor: isSel && range ? colors.white : colors.primary[500], ...(fill && !isSel ? { backgroundColor: fill } : {}) }}
                >
                  <Text variant="body" weight={missed ? 600 : 400} tone={isSel ? 'white' : 'neutral-900'} style={missed && !isSel ? { color: colors.dangerText } : undefined}>
                    {d}
                  </Text>
                  {estimated && !isSel && <Text variant="micro" weight={700} style={{ position: 'absolute', top: -2, right: 1, color: colors.warningText }}>~</Text>}
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
