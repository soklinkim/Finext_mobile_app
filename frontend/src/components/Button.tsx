import { Pressable, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { Text, toneColor, type Tone } from './Text';
import { colors, shadow, textShadow } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

interface Props {
  label: string;
  onPress?: () => void;
  /**
   * primary = primary-900 pill (one per screen, §6.26); soft = primary-50 pill (Log In / Sign Up alt, Search);
   * tint = primary-200 pill (Add More, Search); text = the "Next" text button (§6.10)
   */
  variant?: 'primary' | 'soft' | 'tint' | 'text';
  icon?: IconName;
  trailingIcon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  accessibilityHint?: string;
  /** md = full-size page action (default); sm = compact button inside cards and forms */
  size?: 'md' | 'sm';
}

const BG = { primary: 'bg-primary-900', soft: 'bg-primary-50', tint: 'bg-primary-200', text: '' } as const;

export function Button({ label, onPress, variant = 'primary', icon, trailingIcon, disabled, loading, className, accessibilityHint, size = 'md' }: Props) {
  const small = size === 'sm';
  const dark = useAppTheme();
  const isText = variant === 'text';
  const tone: Tone = variant === 'primary' ? 'white' : isText ? (disabled ? 'neutral-500' : 'neutral-900') : 'primary-900';
  const backgroundColor = dark
    ? variant === 'primary' ? colors.primary[900] : variant === 'soft' ? colors.dark.field : variant === 'tint' ? colors.dark.subtle : undefined
    : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled || !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      className={`items-center justify-center ${isText ? '' : `rounded-pill ${BG[variant]}`} ${disabled && !isText ? 'opacity-50' : ''} ${className ?? ''}`}
      // Only set backgroundColor when there is one: on native an inline `undefined` erases the bg-… class colour.
      style={[{ minHeight: small ? 38 : 48, paddingHorizontal: small ? 16 : 24, ...(backgroundColor ? { backgroundColor } : {}) }, variant === 'primary' && !small && shadow.button]}
    >
      <View className="flex-row items-center justify-center" style={{ gap: small ? 6 : 8 }}>
        {icon && <Icon name={icon} size={small ? 15 : 18} color={toneColor(tone, dark)} />}
        <Text variant={small ? 'body-sm' : isText ? 'title-lg' : 'body-lg'} weight={600} tone={tone} style={isText && !disabled && !small ? textShadow : undefined}>
          {loading ? '…' : label}
        </Text>
        {trailingIcon && <Icon name={trailingIcon} size={small ? 15 : 18} color={toneColor(tone, dark)} />}
      </View>
    </Pressable>
  );
}
