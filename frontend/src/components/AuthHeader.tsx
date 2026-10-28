import { Image, View } from 'react-native';
import { Text } from './Text';
import { colors } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

const FEATHER = require('../../assets/images/feather.png');

/**
 * Top of the Log In and Sign Up screens, on the mist band: the FINEXT mark and name, a title and one line on what it is for.
 * `large` centres everything under a big mark (Log In); the default is the compact left-aligned row (Sign Up).
 */
export function AuthHeader({ title, subtitle, large = false }: { title: string; subtitle: string; large?: boolean }) {
  const dark = useAppTheme();
  const nameColor = dark ? colors.white : colors.primary[900];

  if (large) {
    return (
      <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 28, gap: 18, alignItems: 'center' }}>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Image source={FEATHER} style={{ width: 88, height: 88 }} resizeMode="contain" accessibilityLabel="Finext" />
          <Text variant="display" weight={700} style={{ color: nameColor }}>
            Fi<Text variant="display" weight={700} style={{ color: colors.primary[500] }}>next</Text>
          </Text>
        </View>
        <View style={{ gap: 6, alignItems: 'center' }}>
          <Text variant="title" weight={700} tone="primary-900" accessibilityRole="header" style={{ textAlign: 'center' }}>{title}</Text>
          <Text variant="body" tone="neutral-600" style={{ textAlign: 'center' }}>{subtitle}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: 24, gap: 16 }}>
      <View className="flex-row items-center" style={{ gap: 8 }}>
        <Image source={FEATHER} style={{ width: 36, height: 36 }} resizeMode="contain" accessibilityLabel="Finext" />
        <Text variant="title" weight={700} style={{ color: nameColor }}>
          Fi<Text variant="title" weight={700} style={{ color: colors.primary[500] }}>next</Text>
        </Text>
      </View>
      <View style={{ gap: 6 }}>
        <Text variant="display" tone="primary-900" accessibilityRole="header">{title}</Text>
        <Text variant="body" tone="neutral-600">{subtitle}</Text>
      </View>
    </View>
  );
}
