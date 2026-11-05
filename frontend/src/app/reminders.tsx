import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { Button } from '@/components/Button';
import { Chip, ChipRow } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { ScreenShell } from '@/components/ScreenShell';
import { NumberPickField } from '@/components/NumberPickField';
import { SelectField } from '@/components/SelectField';
import { Text } from '@/components/Text';
import { useI18n, type TKey } from '@/i18n';
import { WEEKDAYS } from '@/lib/format';
import { deleteReminder, formatTime12, nextDue, saveReminder, setReminderEnabled, useReminders, type Reminder, type ReminderFrequency } from '@/services/reminders';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

const FREQUENCIES: { id: ReminderFrequency; label: TKey }[] = [
  { id: 'daily', label: 'reminder.daily' },
  { id: 'weekly', label: 'reminder.weekly' },
  { id: 'monthly', label: 'reminder.monthly' },
];
// 12-hour clock: 1-12 with AM/PM. The reminder itself stores 0-23.
const HOURS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
const MINUTES = Array.from({ length: 12 }, (_, i) => ({ value: i * 5, label: String(i * 5).padStart(2, '0') }));
const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));

type Draft = Omit<Reminder, 'id' | 'lastFired'> & { id?: string };
const NEW_REMINDER: Draft = { frequency: 'daily', hour: 18, minute: 0, weekday: 0, monthDay: 1, enabled: true };

/** Profile > App > Reminders: alarms that remind the owner to record entries, daily, weekly or monthly. */
export default function RemindersScreen() {
  const { t, locale } = useI18n();
  const dark = useAppTheme();
  const { reminders } = useReminders();
  const [draft, setDraft] = useState<Draft | null>(null);
  const line = dark ? colors.dark.border : colors.neutral[200];
  const card = { borderRadius: radius.card, borderWidth: 1, borderColor: line, backgroundColor: dark ? colors.dark.surface : colors.white, padding: 16, gap: 12 } as const;

  const describe = (r: Reminder) => {
    const time = formatTime12(r.hour, r.minute, t('reminder.am'), t('reminder.pm'));
    if (r.frequency === 'weekly') return t('reminder.weeklyAt', { day: WEEKDAYS[locale][r.weekday], time });
    if (r.frequency === 'monthly') return t('reminder.monthlyAt', { day: r.monthDay, time });
    return t('reminder.dailyAt', { time });
  };
  const nextText = (r: Reminder) => new Date(nextDue(r)).toLocaleString(locale === 'km' ? 'km-KH' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const patch = (changes: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...changes } : d));
  const save = async () => {
    if (!draft) return;
    await saveReminder(draft);
    setDraft(null);
  };

  return (
    <ScreenShell title={t('reminder.title')} nav="profile" padding={24}>
      <View style={{ gap: 16 }}>
        <Text variant="body-sm" tone="neutral-600">{t('reminder.intro')}</Text>

        {reminders.map((r) => (
          <View key={r.id} style={{ ...card, gap: 4, opacity: r.enabled ? 1 : 0.6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={describe(r)} onPress={() => setDraft({ id: r.id, frequency: r.frequency, hour: r.hour, minute: r.minute, weekday: r.weekday, monthDay: r.monthDay, enabled: r.enabled })} style={{ flex: 1, gap: 2 }}>
                <Text variant="body" weight={600} tone="primary-900">{describe(r)}</Text>
                <Text variant="caption" tone="neutral-600">{r.enabled ? t('reminder.next', { when: nextText(r) }) : t('reminder.off')}</Text>
              </Pressable>
              <Switch accessibilityLabel={describe(r)} value={r.enabled} onValueChange={(value) => void setReminderEnabled(r.id, value)}
                trackColor={{ true: colors.primary[900], false: colors.neutral[300] }} thumbColor={colors.white} />
            </View>
          </View>
        ))}
        {!reminders.length && !draft && <Text variant="body-sm" tone="neutral-600" style={{ textAlign: 'center', paddingVertical: 16 }}>{t('reminder.none')}</Text>}

        {draft ? (
          <View style={card}>
            <Text variant="body" weight={700} tone="primary-900">{t(draft.id ? 'reminder.edit' : 'reminder.add')}</Text>
            <ChipRow>
              {FREQUENCIES.map((f) => <Chip key={f.id} label={t(f.label)} selected={draft.frequency === f.id} onPress={() => patch({ frequency: f.id })} />)}
            </ChipRow>
            {draft.frequency === 'weekly' && (
              <ChipRow>
                {WEEKDAYS[locale].map((label, i) => <Chip key={label} label={label} selected={draft.weekday === i} onPress={() => patch({ weekday: i })} />)}
              </ChipRow>
            )}
            {draft.frequency === 'monthly' && (
              <SelectField size="form" label={t('reminder.dayOfMonth')} options={MONTH_DAYS} value={draft.monthDay} onChange={(monthDay) => patch({ monthDay })} />
            )}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}><NumberPickField label={t('reminder.hour')} min={1} max={12} options={HOURS} value={draft.hour % 12 || 12} onChange={(h) => patch({ hour: (h % 12) + (draft.hour >= 12 ? 12 : 0) })} /></View>
              <View style={{ flex: 1 }}><NumberPickField label={t('reminder.minute')} min={0} max={59} options={MINUTES} value={draft.minute} onChange={(minute) => patch({ minute })} /></View>
              <View style={{ flex: 1 }}>
                <SelectField size="form" label={t('reminder.period')} options={[{ value: 'am', label: t('reminder.am') }, { value: 'pm', label: t('reminder.pm') }]} value={draft.hour >= 12 ? 'pm' : 'am'}
                  onChange={(p) => patch({ hour: (draft.hour % 12) + (p === 'pm' ? 12 : 0) })} />
              </View>
            </View>
            <Button label={t('reminder.save')} onPress={() => void save()} />
            <Button variant="soft" label={t('common.cancel')} onPress={() => setDraft(null)} />
            {draft.id && (
              <Pressable accessibilityRole="button" onPress={() => { void deleteReminder(draft.id!); setDraft(null); }} hitSlop={8} style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 6 }}>
                <Icon name="close" size={14} color={colors.danger} />
                <Text variant="body-sm" weight={600} style={{ color: colors.danger }}>{t('reminder.delete')}</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <Button label={t('reminder.add')} icon="plus" onPress={() => setDraft(NEW_REMINDER)} />
        )}
      </View>
    </ScreenShell>
  );
}
