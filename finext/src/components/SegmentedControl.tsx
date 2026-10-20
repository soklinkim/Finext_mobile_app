import { Pressable, View } from 'react-native';
import { Text } from './Text';
import { shadow } from '@/theme';

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
  return (
    <View
      accessibilityRole="tablist"
      className="flex-row bg-primary-50 rounded-xl"
      style={{ padding: 4, gap: 4, height: isTab ? 44 : 60 }}
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
            style={selected && isTab ? shadow.button : undefined}
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
