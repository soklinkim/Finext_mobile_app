import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { BellButton } from './BellButton';
import { Icon } from './Icon';
import { Text } from './Text';
import { useI18n } from '@/i18n';
import { colors, shadow } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

interface Props {
  title?: string;
  back?: boolean;
  backFallbackHref?: Href;
  bell?: boolean;
}

/** §6.1 — 40 px back button, centred title, 40 px bell button. */
export function HeaderBar({ title, back = true, backFallbackHref, bell = true }: Props) {
  const router = useRouter();
  const { t } = useI18n();
  const dark = useAppTheme();
  return (
    <View className="flex-row items-center" style={{ height: 60, paddingHorizontal: 20 }}>
      <View style={{ width: 48 }}>
        {back && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            hitSlop={10}
            onPress={() => {
              if (backFallbackHref) {
                // Back to that page if it is open underneath (e.g. the Statements tab), otherwise go there.
                router.dismissTo(backFallbackHref);
                return;
              }
              if (router.canGoBack()) router.back();
              else router.replace('/home');
            }}
            // Same 40 px white circle as the bell on the right, so the header has one button style.
            style={[{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colors.dark.field : colors.white }, !dark && shadow.icon]}
          >
            <Icon name="chevronLeft" size={22} strokeWidth={2.25} color={dark ? colors.dark.primary : colors.primary[900]} />
          </Pressable>
        )}
      </View>
      <View className="flex-1 items-center">
        {title ? (
          <Text variant="title" weight={700} tone="primary-900" numberOfLines={1}>
            {title}
          </Text>
        ) : null}
      </View>
      <View style={{ width: 48 }} className="items-end">
        {bell && <BellButton />}
      </View>
    </View>
  );
}
