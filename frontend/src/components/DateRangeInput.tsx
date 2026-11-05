import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Button } from './Button';
import { CalendarGrid } from './CalendarGrid';
import { Icon } from './Icon';
import { Text } from './Text';
import { colors, radius, tint } from '@/theme';
import { useI18n } from '@/i18n';
import { formatInputDate } from '@/lib/format';
import { useAppTheme } from '@/theme/AppTheme';

/** A span of days, as the start of its first day and the end of its last (epoch ms). Both null = any date. */
export interface DateRange {
  from: number | null;
  to: number | null;
}

export const startOfDay = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const endOfDay = (ms: number) => { const d = new Date(ms); d.setHours(23, 59, 59, 999); return d.getTime(); };
/** One day: today, say. */
export const dayRange = (ms: number): DateRange => ({ from: startOfDay(ms), to: endOfDay(ms) });

const longDay = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });

const describe = (range: DateRange) => {
  if (range.from === null || range.to === null) return null;
  const a = formatInputDate(range.from);
  const b = formatInputDate(range.to);
  return a === b ? a : `${a} – ${b}`;
};

/**
 * Pick one day or a span of days: open the calendar, tap the first day, then tap the last day. Tapping a day before the
 * first one starts the span there. Apply keeps the choice; with only one day tapped, that single day is used.
 */
export function DateRangeInput({ value, onChange }: { value: DateRange; onChange: (range: DateRange) => void }) {
  const { t } = useI18n();
  const dark = useAppTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>(value);
  // The day the next tap ends a span from (the span's first day was tapped and its last has not been yet).
  const [picking, setPicking] = useState(false);
  const [cursor, setCursor] = useState(() => { const d = new Date(value.from ?? Date.now()); return { year: d.getFullYear(), month: d.getMonth() }; });

  const show = () => {
    const shown = new Date(value.from ?? Date.now());
    setDraft(value);
    setPicking(false);
    setCursor({ year: shown.getFullYear(), month: shown.getMonth() });
    setOpen(true);
  };

  const tap = (date: Date) => {
    const ms = date.getTime();
    if (!picking || draft.from === null) {
      setDraft(dayRange(ms));
      setPicking(true);
    } else if (ms < draft.from) {
      setDraft({ from: startOfDay(ms), to: draft.to ?? endOfDay(draft.from) });
      setPicking(false);
    } else {
      setDraft({ from: draft.from, to: endOfDay(ms) });
      setPicking(false);
    }
  };

  const text = describe(value);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={text ?? t('range.any')} onPress={show}
        className="flex-row items-center justify-between rounded-lg" style={{ minHeight: 40, paddingHorizontal: 14, paddingVertical: 8, gap: 6, backgroundColor: dark ? colors.dark.field : colors.primary[50] }}>
        <Text variant="body" weight={500} tone={text ? 'primary-900' : 'neutral-500'} numberOfLines={1} adjustsFontSizeToFit style={{ flexShrink: 1 }}>{text ?? t('range.any')}</Text>
        <View className="items-center justify-center bg-primary-200" style={{ width: 24, height: 24, borderRadius: 6 }}>
          <Icon name="calendar" size={14} />
        </View>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable className="flex-1 items-center justify-center px-6" style={{ backgroundColor: tint(colors.shadow, 0.35) }} onPress={() => setOpen(false)}>
          <Pressable className="w-full bg-white" style={{ borderRadius: radius.lg, padding: 20, gap: 12, backgroundColor: dark ? colors.dark.background : colors.white }} onPress={() => undefined}>
            {/* From and To, as chosen so far. */}
            <View style={{ flexDirection: 'row', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: dark ? colors.dark.border : colors.neutral[200] }}>
              {([['range.from', draft.from], ['range.to', draft.to]] as const).map(([label, ms], index) => (
                <View key={label} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, gap: 2, ...(index ? { borderLeftWidth: 1, borderLeftColor: dark ? colors.dark.border : colors.neutral[200] } : {}) }}>
                  <Text variant="caption" tone="neutral-600">{t(label)}</Text>
                  <Text variant="body-sm" weight={700} tone="primary-900">{ms === null ? '—' : longDay(ms)}</Text>
                </View>
              ))}
            </View>
            <CalendarGrid
              year={cursor.year}
              month={cursor.month}
              onMonthChange={(year, month) => setCursor({ year, month })}
              selected={null}
              range={draft}
              onSelect={tap}
            />
            <Text variant="caption" tone="neutral-600" style={{ textAlign: 'center' }}>{t(picking ? 'range.pickEnd' : 'range.pickStart')}</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}><Button variant="soft" label={t('common.cancel')} onPress={() => setOpen(false)} /></View>
              <View style={{ flex: 1 }}><Button label={t('overview.apply')} onPress={() => { onChange(draft); setOpen(false); }} /></View>
            </View>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { onChange({ from: null, to: null }); setOpen(false); }} style={{ alignItems: 'center' }}>
              <Text variant="caption" weight={600} tone="primary-500">{t('range.clear')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
