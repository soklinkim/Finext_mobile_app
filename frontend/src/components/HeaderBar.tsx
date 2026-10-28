import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { BellButton } from './BellButton';
import { Icon } from './Icon';
import { Text } from './Text';
import { useI18n } from '@/i18n';
import { colors } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

interface Props {
  title?: string;
  back?: boolean;
  backFallbackHref?: Href;
  bell?: boolean;
}

/** §6.1 — 32 px back button, centred title, 32 px bell button. */
export function HeaderBar({ title, back = true, backFallbackHref, bell = true }: Props) {
  const router = useRouter();
  const { t } = useI18n();
  const dark = useAppTheme();
  return (
    <View className="flex-row items-center px-6" style={{ height: 56 }}>
      <View style={{ width: 44 }}>
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
            // Same 32 px white circle as the bell on the right, so the header has one button style.
            style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colors.dark.field : colors.white }}
          >
            <Icon name="chevronLeft" size={20} strokeWidth={2} color={dark ? colors.dark.primary : colors.primary[900]} />
          </Pressable>
        )}
      </View>
      <View className="flex-1 items-center">
        {title ? (
          <Text variant="title" tone="primary-900" numberOfLines={1}>
            {title}
          </Text>
        ) : null}
      </View>
      <View style={{ width: 44 }} className="items-end">
        {bell && <BellButton />}
      </View>
    </View>
  );
}
