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
  /**
   * 'pill' = compact filter (Daily / Weekly…): white selected pill on a pale track (§6.6);
   * 'tab' = Money in | Money out switch with a filled selected item (§6.16);
   * 'underline' = page sections (Performance / Health / Loan): text tabs with a bar under the selected one.
   */
  variant?: 'pill' | 'tab' | 'underline';
}

/** Single-select segmented control used for periods, tab switches and page sections. */
export function SegmentedControl<T extends string>({ options, value, onChange, variant = 'pill' }: Props<T>) {
  const dark = useAppTheme();

  if (variant === 'underline') {
    return (
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: dark ? colors.dark.border : colors.neutral[200] }}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onChange(o.value)}
              style={{ flex: 1, alignItems: 'center', paddingTop: 6, paddingBottom: 10 }}>
              <Text variant="body-sm" weight={selected ? 700 : 500} tone={selected ? 'primary-900' : 'neutral-600'}>{o.label}</Text>
              {/* The bar sits on the container's bottom line. */}
              <View style={{ position: 'absolute', bottom: -1, left: '20%', height: 3, width: '60%', borderRadius: 2, backgroundColor: selected ? (dark ? colors.dark.primary : colors.primary[900]) : 'transparent' }} />
            </Pressable>
          );
        })}
      </View>
    );
  }

  const isTab = variant === 'tab';
  if (isTab) {
    return (
      <View
        accessibilityRole="tablist"
        className="flex-row bg-primary-50 rounded-xl"
        style={{ padding: 4, gap: 4, height: 44, borderRadius: radius.card, ...(dark ? { backgroundColor: colors.dark.surface } : {}) }}
      >
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onChange(o.value)}
              className={`flex-1 items-center justify-center rounded-md ${selected ? 'bg-primary-900' : ''}`}
              style={selected ? shadow.button : undefined}
            >
              <Text variant="caption" weight={selected ? 600 : 500} tone={selected ? 'white' : 'primary-900'}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  // Pill: a quiet filter. The selected option is a white pill with a soft shadow on a pale track.
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', padding: 3, gap: 2, height: 40, borderRadius: 12, backgroundColor: dark ? colors.dark.surface : colors.mist }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[
              { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
              selected ? { backgroundColor: dark ? colors.dark.subtle : colors.white, ...shadow.soft } : undefined,
            ]}
          >
            <Text variant="caption" weight={selected ? 600 : 500} tone={selected ? 'primary-900' : 'neutral-600'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
