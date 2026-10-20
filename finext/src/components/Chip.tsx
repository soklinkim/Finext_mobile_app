import { Pressable, View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { colors, shadow } from '@/theme';

interface Props {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}

/** §6.17 — pill chip; selected = primary-900 fill + check icon. */
export function Chip({ label, selected = false, onPress, disabled }: Props) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      className={`flex-row items-center rounded-pill ${selected ? 'bg-primary-900' : 'bg-white border border-primary-200'} ${disabled ? 'opacity-50' : ''}`}
      style={[{ paddingHorizontal: 11, paddingVertical: 6, gap: 4, minHeight: 28 }, selected && shadow.button]}
    >
      {selected && <Icon name="check" size={10} color={colors.white} strokeWidth={3} />}
      <Text variant="caption" tone={selected ? 'white' : 'primary-900'} weight={selected ? 600 : 500} style={{ fontSize: 11.5, lineHeight: 16 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-row flex-wrap" style={{ gap: 6 }}>
      {children}
    </View>
  );
}
