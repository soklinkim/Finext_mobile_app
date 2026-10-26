import { Pressable, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { colors, radius } from '@/theme';

interface Props {
  label: string;
  selected?: boolean;
  icon?: IconName;
  /** "Add New Template": white 2 px plus icon */
  add?: boolean;
  onPress?: () => void;
}

/** §6.14 — 105 × 97 tile, accent-tile (selected: primary-900) with a 2-line label under it. */
export function StatementTile({ label, selected, icon, add, onPress }: Props) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} className="items-center" style={{ width: 105, gap: 8 }}>
      <View className={`items-center justify-center ${selected ? 'bg-primary-900' : 'bg-accent-tile'}`} style={{ width: 105, height: 97, borderRadius: radius.xl }}>
        {add ? <Icon name="plus" size={48} color={colors.white} strokeWidth={2} /> : icon ? <Icon name={icon} size={40} color={colors.white} strokeWidth={1.5} /> : null}
      </View>
      <Text variant="caption" tone="primary-900" numberOfLines={2} style={{ textAlign: 'center' }}>
        {label}
      </Text>
    </Pressable>
  );
}
