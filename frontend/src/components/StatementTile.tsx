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

/** Column width of a 3-across tile grid: a share of the row, so narrow phones keep a gap between tiles. */
export const TILE_COLUMN = { width: '29%', maxWidth: 105 } as const;

/** §6.14 — 105 × 97 tile (smaller on narrow phones), accent-tile (selected: primary-900) with a 2-line label under it. */
export function StatementTile({ label, selected, icon, add, onPress }: Props) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} className="items-center" style={{ ...TILE_COLUMN, gap: 8 }}>
      <View className={`items-center justify-center ${selected ? 'bg-primary-900' : 'bg-accent-tile'}`} style={{ width: '100%', aspectRatio: 105 / 97, borderRadius: radius.xl }}>
        {add ? <Icon name="plus" size={48} color={colors.white} strokeWidth={2} /> : icon ? <Icon name={icon} size={40} color={colors.white} strokeWidth={1.5} /> : null}
      </View>
      <Text variant="caption" tone="primary-900" numberOfLines={2} style={{ textAlign: 'center' }}>
        {label}
      </Text>
    </Pressable>
  );
}
