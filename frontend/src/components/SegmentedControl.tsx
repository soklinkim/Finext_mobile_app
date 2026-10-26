import { Pressable, View } from 'react-native';
import { Text } from './Text';
import { colors, radius, shadow } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** 'pill' = Daily/Weekly track (§6.6); 'tab' = Money in | Money out tab switch with a filled selected item (§6.16) */
  variant?: 'pill' | 'tab';
}

/** Single-select segmented control used for periods and tab switches. */
export function SegmentedControl<T extends string>({ options, value, onChange, variant = 'pill' }: Props<T>) {
  const isTab = variant === 'tab';
  const dark = useAppTheme();
  return (
    <View
      accessibilityRole="tablist"
      className="flex-row bg-primary-50 rounded-xl"
      style={{ padding: 4, gap: 4, height: isTab ? 44 : 60, borderRadius: radius.card, backgroundColor: dark ? colors.dark.surface : undefined }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            className={`flex-1 items-center justify-center rounded-md ${selected ? (isTab ? 'bg-primary-900' : 'bg-primary-200') : ''}`}
            style={[selected && isTab ? shadow.button : undefined, selected && !isTab && dark ? { backgroundColor: colors.dark.subtle } : undefined]}
          >
            <Text variant={isTab ? 'caption' : 'body-lg'} weight={selected ? (isTab ? 600 : 500) : isTab ? 500 : 400} tone={selected && isTab ? 'white' : isTab ? 'primary-900' : 'neutral-900'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
