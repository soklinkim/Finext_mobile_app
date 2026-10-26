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
  /** back arrow colour: primary-900 normally, primary-50 on Calendar / Search / Statements (§6.1) */
  light?: boolean;
  bell?: boolean;
}

/** §6.1 — back arrow, centred title, 32 px bell button. */
export function HeaderBar({ title, back = true, backFallbackHref, light = false, bell = true }: Props) {
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
                router.replace(backFallbackHref);
                return;
              }
              if (router.canGoBack()) router.back();
              else router.replace('/home');
            }}
            className="items-start justify-center"
            style={{ height: 44 }}
          >
            <Icon name="back" size={24} color={light ? colors.primary[50] : dark ? colors.dark.primary : colors.primary[900]} />
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
