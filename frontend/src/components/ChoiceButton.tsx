import { Image, Pressable, View, type ImageSourcePropType } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { colors, shadow } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** 60 px circular flag inset 14 px left (language selection) */
  flag?: ImageSourcePropType;
  flagFallback?: React.ReactNode;
  /** shows the 14 px info icon right of the label; tapping it calls this */
  onInfoPress?: () => void;
}

/** §6.10 — 84 px pill, single-select radio group item. Selected = primary-900, unselected = primary-50. */
export function ChoiceButton({ label, selected, onPress, flag, flagFallback, onInfoPress }: Props) {
  const dark = useAppTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`flex-row items-center justify-center rounded-pill ${selected ? 'bg-primary-900' : 'bg-primary-50'}`}
      style={[{ height: 84, paddingHorizontal: 14, backgroundColor: dark ? (selected ? colors.primary[900] : colors.dark.surface) : undefined }, shadow.button]}
    >
      {(flag || flagFallback) && (
        <View style={{ position: 'absolute', left: 14, width: 60, height: 60, borderRadius: 30, overflow: 'hidden' }}>
          {flag ? <Image source={flag} style={{ width: 60, height: 60 }} /> : flagFallback}
        </View>
      )}
      <Text variant="body-lg" weight={600} tone={selected ? 'white' : 'primary-900'} style={{ textAlign: 'center', flexShrink: 1, marginLeft: flag || flagFallback ? 60 : 0 }}>
        {label}
      </Text>
      {onInfoPress && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} information`}
          hitSlop={14}
          onPress={(event) => {
            event.stopPropagation();
            onInfoPress();
          }}
          style={{ marginLeft: 8 }}
        >
          <Icon name="info" size={14} color={selected ? colors.primary[50] : dark ? colors.dark.primary : colors.primary[900]} />
        </Pressable>
      )}
    </Pressable>
  );
}
