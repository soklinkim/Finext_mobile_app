import { Pressable, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { Text, toneColor, type Tone } from './Text';
import { shadow, textShadow } from '@/theme';

interface Props {
  label: string;
  onPress?: () => void;
  /**
   * primary = primary-900 pill (one per screen, §6.26); soft = primary-50 pill (Log In / Sign Up alt, Search);
   * tint = primary-200 pill (Add More, Search); text = the "Next" text button (§6.10)
   */
  variant?: 'primary' | 'soft' | 'tint' | 'text';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  accessibilityHint?: string;
}

const BG = { primary: 'bg-primary-900', soft: 'bg-primary-50', tint: 'bg-primary-200', text: '' } as const;

export function Button({ label, onPress, variant = 'primary', icon, disabled, loading, className, accessibilityHint }: Props) {
  const isText = variant === 'text';
  const tone: Tone = variant === 'primary' ? 'white' : isText ? (disabled ? 'neutral-500' : 'neutral-900') : 'primary-900';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled || !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      className={`items-center justify-center ${isText ? '' : `rounded-pill ${BG[variant]}`} ${disabled && !isText ? 'opacity-50' : ''} ${className ?? ''}`}
      style={[{ minHeight: 48, paddingHorizontal: 24 }, variant === 'primary' && shadow.button]}
    >
      <View className="flex-row items-center justify-center" style={{ gap: 8 }}>
        {icon && <Icon name={icon} size={18} color={toneColor(tone)} />}
        <Text variant={isText ? 'title-lg' : 'body-lg'} weight={600} tone={tone} style={isText && !disabled ? textShadow : undefined}>
          {loading ? '…' : label}
        </Text>
      </View>
    </Pressable>
  );
}
