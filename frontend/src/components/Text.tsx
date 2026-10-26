import { Text as RNText, type TextProps } from 'react-native';
import { colors, textStyle, type TypeToken } from '@/theme';
import { useI18n } from '@/i18n';
import { useAppTheme } from '@/theme/AppTheme';

const TONES = {
  'primary-900': colors.primary[900],
  'primary-500': colors.primary[500],
  'primary-200': colors.primary[200],
  'primary-50': colors.primary[50],
  'neutral-900': colors.neutral[900],
  'neutral-600': colors.neutral[600],
  'neutral-500': colors.neutral[500],
  white: colors.white,
  expense: colors.accent.expense,
  danger: colors.danger,
  warning: colors.warning,
} as const;

export type Tone = keyof typeof TONES;
export const toneColor = (tone: Tone, dark = false): string => {
  if (dark) {
    if (tone === 'primary-900' || tone === 'neutral-900') return colors.dark.text;
    if (tone === 'primary-500' || tone === 'primary-200' || tone === 'primary-50') return colors.dark.primary;
    if (tone === 'neutral-600') return colors.dark.muted;
    if (tone === 'neutral-500') return colors.dark.faint;
  }
  return TONES[tone];
};

interface Props extends TextProps {
  variant?: TypeToken;
  /** colour token; default neutral-900 (body text). Colour is never set with className. */
  tone?: Tone;
  /** override the token's font weight */
  weight?: 300 | 400 | 500 | 600 | 700;
  italic?: boolean;
  className?: string;
}

/** Every piece of text goes through here so size, line height, colour and font follow the tokens (§3). */
export function Text({ variant = 'body', tone = 'neutral-900', weight, italic, style, ...rest }: Props) {
  const { locale } = useI18n();
  const dark = useAppTheme();
  return <RNText style={[textStyle(variant, locale, weight), { color: toneColor(tone, dark) }, italic && { fontStyle: 'italic' }, style]} {...rest} />;
}
