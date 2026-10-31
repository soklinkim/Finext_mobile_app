import { useRef, useState, type ComponentRef } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { useScrollToError } from './FieldFocus';
import { FieldLabel } from './FieldLabel';
import { Text } from './Text';
import { colors, fontFamily } from '@/theme';
import { useI18n } from '@/i18n';
import { useAppTheme } from '@/theme/AppTheme';

interface Props extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  /** 'entry' = bookkeeping form field (§6.22); 'form' = onboarding / profile field (§6.11, label above) */
  variant?: 'entry' | 'form';
  /** content on the right inside the box (icon button, currency code…) */
  right?: React.ReactNode;
  left?: React.ReactNode;
  fieldBackgroundColor?: string;
  /** 'box' = filled field (default); 'row' = a borderless row inside a card: small grey label, value in ink */
  appearance?: 'box' | 'row';
  /** shows a red * after the label */
  required?: boolean;
}

/** Text input on primary-50. Focus = 2 px primary-500 outline, error = 2 px danger outline + helper text. */
export function TextField({ label, error, variant = 'entry', right, left, fieldBackgroundColor, onFocus, onBlur, multiline, appearance = 'box', required, ...rest }: Props) {
  const { locale } = useI18n();
  const dark = useAppTheme();
  const isForm = variant === 'form';
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const outerRef = useScrollToError(error, { focus: () => inputRef.current?.focus(), skip: focused });
  const border = error ? colors.danger : focused ? colors.primary[500] : 'transparent';

  if (appearance === 'row') {
    return (
      <View ref={outerRef} style={{ gap: 2, paddingVertical: 12 }}>
        {label ? <FieldLabel label={label} required={required} variant="caption" weight={500} style={{ color: error ? colors.danger : focused ? colors.primary[500] : dark ? colors.dark.muted : colors.neutral[600] }} /> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {left}
          <TextInput
            ref={inputRef}
            multiline={multiline}
            placeholderTextColor={colors.neutral[500]}
            accessibilityLabel={label}
            onFocus={(e) => { setFocused(true); onFocus?.(e); }}
            onBlur={(e) => { setFocused(false); onBlur?.(e); }}
            style={{ flex: 1, minWidth: 0, color: dark ? colors.dark.text : colors.neutral[900], fontFamily: fontFamily(500, locale), fontSize: 15, paddingVertical: 2, minHeight: multiline ? 48 : 24, textAlignVertical: multiline ? 'top' : 'center' }}
            {...rest}
          />
          {right}
        </View>
        {error ? <Text variant="caption" tone="danger">{error}</Text> : null}
      </View>
    );
  }
  return (
    <View ref={outerRef} style={{ gap: 4 }}>
      {label ? <FieldLabel label={label} required={required} variant={isForm ? 'body' : 'micro'} weight={isForm ? 500 : 300} tone={isForm ? 'primary-900' : 'neutral-600'} /> : null}
      <View
        className={`flex-row items-center bg-primary-50 ${isForm ? 'rounded-lg' : 'rounded-field'}`}
        style={{ borderWidth: 2, borderColor: border, minHeight: isForm ? 40 : 36, paddingHorizontal: isForm ? 20 : 12, gap: 8, backgroundColor: dark ? colors.dark.field : fieldBackgroundColor ?? colors.primary[50] }}
      >
        {left}
        <TextInput
          ref={inputRef}
          multiline={multiline}
          placeholderTextColor={colors.neutral[500]}
          accessibilityLabel={label}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={{
            flex: 1,
            minWidth: 0,
            color: dark ? colors.dark.text : colors.primary[900],
            fontFamily: fontFamily(500, locale),
            fontSize: isForm ? 15 : 13,
            paddingVertical: multiline ? 8 : 4,
            minHeight: multiline ? 64 : undefined,
            textAlignVertical: multiline ? 'top' : 'center',
          }}
          {...rest}
        />
        {right}
      </View>
      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
