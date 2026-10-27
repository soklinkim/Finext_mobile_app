import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from './Icon';
import { PickerModal, type PickerOption } from './PickerModal';
import { Text } from './Text';
import { colors, shadow } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

interface Props<T extends string | number> {
  label?: string;
  placeholder?: string;
  options: PickerOption<T>[];
  value?: T | null;
  onChange: (value: T) => void;
  /** 'field' = full-width dropdown box; 'chip' = white pill with shadow (bank selector, §6.11) */
  variant?: 'field' | 'chip';
  error?: string;
  /** field style: entry form (radius 12, 12 px text) or onboarding form (radius 20) */
  size?: 'entry' | 'form';
  fieldBackgroundColor?: string;
}

/** Dropdown that opens a PickerModal. */
export function SelectField<T extends string | number>({ label, placeholder, options, value, onChange, variant = 'field', error, size = 'entry', fieldBackgroundColor }: Props<T>) {
  const [open, setOpen] = useState(false);
  const dark = useAppTheme();
  const selected = options.find((o) => o.value === value);
  const title = label ?? placeholder ?? '';

  const trigger =
    variant === 'chip' ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${selected?.label ?? ''}`}
        onPress={() => setOpen(true)}
        className="flex-row items-center self-start rounded-pill bg-white"
        style={[{ height: 32, paddingHorizontal: 12, gap: 8, ...(dark ? { backgroundColor: colors.dark.field } : {}) }, shadow.button]}
      >
        <Text variant="body-sm" weight={600} tone="primary-900">
          {selected?.label ?? placeholder}
        </Text>
        <Icon name="chevronDown" size={14} color={dark ? colors.dark.primary : undefined} />
      </Pressable>
    ) : (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${selected?.label ?? ''}`}
        onPress={() => setOpen(true)}
        className={`flex-row items-center justify-between bg-primary-50 ${size === 'form' ? 'rounded-lg' : 'rounded-field'} ${error ? 'border-2 border-danger' : ''}`}
        style={{ minHeight: size === 'form' ? 40 : 36, paddingHorizontal: size === 'form' ? 20 : 12, paddingVertical: 8, backgroundColor: dark ? colors.dark.field : fieldBackgroundColor ?? colors.primary[50] }}
      >
        <Text variant={size === 'form' ? 'body' : 'caption'} tone={selected ? 'primary-900' : 'neutral-500'} weight={selected ? 500 : 300} style={{ flexShrink: 1 }}>
          {selected?.label ?? placeholder}
        </Text>
        <Icon name="chevronDown" size={16} color={dark ? colors.dark.primary : colors.primary[500]} />
      </Pressable>
    );

  return (
    <View style={{ gap: 4 }}>
      {label && variant === 'field' ? (
        <Text variant="micro" weight={300} tone="neutral-600">
          {label}
        </Text>
      ) : null}
      {trigger}
      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : null}
      <PickerModal visible={open} title={title} options={options} value={value} onSelect={onChange} onClose={() => setOpen(false)} />
    </View>
  );
}
