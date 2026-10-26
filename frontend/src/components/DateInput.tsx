import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { CalendarGrid } from './CalendarGrid';
import { Icon } from './Icon';
import { TextField } from './TextField';
import { Button } from './Button';
import { colors, radius, tint } from '@/theme';
import { useI18n } from '@/i18n';
import { formatInputDate, parseInputDate } from '@/lib/format';
import { useAppTheme } from '@/theme/AppTheme';

interface Props {
  label?: string;
  /** epoch ms, or null when empty / invalid */
  value: number | null;
  onChange: (ms: number | null) => void;
  error?: string;
  variant?: 'entry' | 'form';
}

/** §6.11 — `DD/MM/YY` text input with a 24 px calendar icon button (primary-200 bg) that opens a date picker. */
export function DateInput({ label, value, onChange, error, variant = 'form' }: Props) {
  const { t } = useI18n();
  const dark = useAppTheme();
  const [text, setText] = useState(value ? formatInputDate(value) : '');
  const [open, setOpen] = useState(false);
  const base = value ? new Date(value) : new Date();
  const [cursor, setCursor] = useState({ year: base.getFullYear(), month: base.getMonth() });

  const commit = (s: string) => {
    setText(s);
    onChange(parseInputDate(s));
  };

  return (
    <>
      <TextField
        variant={variant}
        label={label}
        value={text}
        onChangeText={commit}
        placeholder="DD/MM/YY"
        keyboardType="numbers-and-punctuation"
        error={error ?? (text.length >= 6 && parseInputDate(text) === null ? t('error.invalidDate') : undefined)}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.calendar')}
            onPress={() => setOpen(true)}
            className="items-center justify-center bg-primary-200"
            style={{ width: 24, height: 24, borderRadius: 6 }}
          >
            <Icon name="calendar" size={14} />
          </Pressable>
        }
      />
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable className="flex-1 items-center justify-center px-6" style={{ backgroundColor: tint(colors.shadow, 0.35) }} onPress={() => setOpen(false)}>
          <Pressable className="w-full bg-white" style={{ borderRadius: radius.lg, padding: 20, gap: 12, backgroundColor: dark ? colors.dark.background : colors.white }} onPress={() => undefined}>
            <CalendarGrid
              year={cursor.year}
              month={cursor.month}
              onMonthChange={(year, month) => setCursor({ year, month })}
              selected={value ? new Date(value) : null}
              onSelect={(d) => {
                d.setHours(12, 0, 0, 0);
                commit(formatInputDate(d.getTime()));
                setOpen(false);
              }}
            />
            <View>
              <Button variant="soft" label={t('common.close')} onPress={() => setOpen(false)} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
