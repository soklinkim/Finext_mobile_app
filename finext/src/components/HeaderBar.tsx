import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from './Icon';
import { Text } from './Text';
import { useI18n } from '@/i18n';
import { colors } from '@/theme';

interface Props {
  title?: string;
  back?: boolean;
  /** back arrow colour: primary-900 normally, primary-50 on Calendar / Search / Statements (§6.1) */
  light?: boolean;
  bell?: boolean;
}

/** §6.1 — back arrow, centred title, 32 px bell button. */
export function HeaderBar({ title, back = true, light = false, bell = true }: Props) {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <View className="flex-row items-center px-6" style={{ height: 56 }}>
      <View style={{ width: 44 }}>
        {back && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            hitSlop={10}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
            className="items-start justify-center"
            style={{ height: 44 }}
          >
            <Icon name="back" size={24} color={light ? colors.primary[50] : colors.primary[900]} />
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
        {bell && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.notifications')}
            hitSlop={6}
            onPress={() => router.push('/notifications')}
            className="items-center justify-center rounded-pill bg-primary-50"
            style={{ width: 32, height: 32 }}
          >
            <Icon name="bell" size={18} />
          </Pressable>
        )}
      </View>
    </View>
  );
}
