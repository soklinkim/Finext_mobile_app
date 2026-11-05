import { useState } from 'react';
import { Pressable } from 'react-native';
import { Icon } from './Icon';
import { PickerModal } from './PickerModal';
import { TextField } from './TextField';
import { colors } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  /** the list the arrow opens (the number can also be typed) */
  options: { value: number; label: string }[];
  onChange: (value: number) => void;
}

/** A number the owner can type, or pick from a list with the arrow. Typing only counts once it is a whole number in range. */
export function NumberPickField({ label, value, min, max, options, onChange }: Props) {
  const dark = useAppTheme();
  const [text, setText] = useState<string | null>(null); // what is being typed; null = show the chosen value
  const [open, setOpen] = useState(false);
  const shown = text ?? options.find((o) => o.value === value)?.label ?? (min === 0 ? String(value).padStart(2, '0') : String(value));

  const type = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    setText(digits);
    const n = Number(digits);
    if (digits !== '' && n >= min && n <= max) onChange(n);
  };

  return (
    <>
      <TextField
        variant="form"
        label={label}
        value={shown}
        onChangeText={type}
        onFocus={() => setText('')}
        onBlur={() => setText(null)}
        keyboardType="number-pad"
        selectTextOnFocus
        maxLength={2}
        right={
          <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setOpen(true)} hitSlop={8}>
            <Icon name="chevronDown" size={16} color={dark ? colors.dark.primary : colors.primary[500]} />
          </Pressable>
        }
      />
      <PickerModal visible={open} title={label} options={options} value={value} onSelect={(v) => { setText(null); onChange(v); }} onClose={() => setOpen(false)} />
    </>
  );
}
