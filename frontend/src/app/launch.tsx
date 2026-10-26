import { Image, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { useI18n } from '@/i18n';
import { colors } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

/** Launch B — logo, tagline, Log In / Sign Up / Forgot Password. */
export default function Launch() {
  const router = useRouter();
  const { t } = useI18n();
  const dark = useAppTheme();
  return (
    <SafeAreaView className="flex-1 bg-white" style={{ backgroundColor: dark ? colors.dark.background : colors.white }}>
      <View className="flex-1 items-center justify-center px-6" style={{ gap: 12 }}>
        <Image source={require('../../assets/images/logo.png')} style={{ width: 300, height: 300 }} resizeMode="contain" accessibilityLabel="Finext" />
        <Text variant="body-sm" tone="neutral-600" style={{ textAlign: 'center', marginBottom: 12 }}>
          {t('launch.tagline')}
        </Text>
        <View className="w-full" style={{ gap: 12, paddingHorizontal: 40 }}>
          <Button label={t('auth.login')} onPress={() => router.push('/login')} />
          <Button variant="soft" label={t('auth.signup')} onPress={() => router.push('/signup')} />
        </View>
      </View>
    </SafeAreaView>
  );
}
