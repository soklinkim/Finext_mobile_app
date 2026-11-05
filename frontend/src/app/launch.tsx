import { Image, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { useI18n } from '@/i18n';
import { setLanguagePreference } from '@/services/preferences';
import { CambodiaFlag, UkFlag } from '@/components/Flags';
import { colors, fontFamily, type Locale } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

// Both flags are pictures (assets/images/cambodia-flag.png and uk-flag.png).
const LANGUAGES: { value: Locale; label: string; flag: typeof CambodiaFlag }[] = [
  { value: 'km', label: 'ខ្មែរ', flag: CambodiaFlag },
  { value: 'en-GB', label: 'English', flag: UkFlag },
];

/** Launch B — logo, tagline, Log In / Sign Up / Forgot Password. */
export default function Launch() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const dark = useAppTheme();
  return (
    <SafeAreaView className="flex-1 bg-white" style={{ backgroundColor: dark ? colors.dark.background : colors.white }}>
      <View className="flex-1 items-center justify-center px-6" style={{ gap: 12 }}>
        <Image source={require('../../assets/images/logo.png')} style={{ width: 300, height: 300 }} resizeMode="contain" accessibilityLabel="Finext" />
        <Text variant="body-sm" tone="neutral-600" style={{ textAlign: 'center', marginBottom: 12 }}>
          {t('launch.tagline')}
        </Text>
        {/* Chosen before signing in, so sign-up, login and onboarding all speak the owner's language. */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }} accessibilityRole="radiogroup">
          {LANGUAGES.map(({ value, label, flag: Flag }) => {
            const selected = locale === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => void setLanguagePreference(value)}
                style={{
                  minWidth: 120,
                  minHeight: 44,
                  paddingHorizontal: 14,
                  gap: 8,
                  flexDirection: 'row',
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: selected ? colors.primary[500] : dark ? colors.dark.border : colors.neutral[200],
                  backgroundColor: selected ? (dark ? colors.dark.field : colors.primary[50]) : 'transparent',
                }}
              >
                <View style={{ width: 24, height: 24, borderRadius: 12, overflow: 'hidden' }}><Flag size={24} /></View>
                {/* Each name is set in its own language's font, whichever language the screen is in. */}
                <Text variant="body-sm" weight={selected ? 700 : 500} tone={selected ? 'primary-900' : 'neutral-600'} style={{ fontFamily: fontFamily(selected ? 700 : 500, value) }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View className="w-full" style={{ gap: 12, paddingHorizontal: 40 }}>
          <Button label={t('auth.login')} onPress={() => router.push('/login')} />
          <Button variant="soft" label={t('auth.signup')} onPress={() => router.push('/signup')} />
        </View>
      </View>
    </SafeAreaView>
  );
}
