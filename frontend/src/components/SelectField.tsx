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
  /** 'box' = filled field (default); 'row' = a borderless row inside a card, like TextField's row */
  appearance?: 'box' | 'row';
}

/** Dropdown that opens a PickerModal. */
export function SelectField<T extends string | number>({ label, placeholder, options, value, onChange, variant = 'field', error, size = 'entry', fieldBackgroundColor, appearance = 'box' }: Props<T>) {
  const [open, setOpen] = useState(false);
  const dark = useAppTheme();
  const selected = options.find((o) => o.value === value);
  const title = label ?? placeholder ?? '';

  if (appearance === 'row') {
    return (
      <View>
        <Pressable accessibilityRole="button" accessibilityLabel={`${title}: ${selected?.label ?? ''}`} onPress={() => setOpen(true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            {label ? <Text variant="caption" weight={500} style={{ color: error ? colors.danger : dark ? colors.dark.muted : colors.neutral[600] }}>{label}</Text> : null}
            <Text variant="body" weight={500} style={{ color: selected ? (dark ? colors.dark.text : colors.neutral[900]) : colors.neutral[500] }}>
              {selected?.label ?? placeholder}
            </Text>
          </View>
          <Icon name="chevronDown" size={16} color={dark ? colors.dark.primary : colors.primary[500]} />
        </Pressable>
        {error ? <Text variant="caption" tone="danger" style={{ paddingBottom: 8 }}>{error}</Text> : null}
        <PickerModal visible={open} title={title} options={options} value={value} onSelect={onChange} onClose={() => setOpen(false)} />
      </View>
    );
  }

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
        // Form size matches TextField's form label, so text boxes and drop-downs in one form look alike.
        <Text variant={size === 'form' ? 'body' : 'micro'} weight={size === 'form' ? 500 : 300} tone={size === 'form' ? 'primary-900' : 'neutral-600'}>
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
