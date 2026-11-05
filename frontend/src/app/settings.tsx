import { Alert, Pressable, View } from 'react-native';
import { CambodiaFlag, UkFlag } from '@/components/Flags';
import { Icon, type IconName } from '@/components/Icon';
import { ScreenShell } from '@/components/ScreenShell';
import { Text } from '@/components/Text';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n } from '@/i18n';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';
import { clearAnalysisCache } from '@/services/analysis';
import { canChangeCurrency, getSettings, updateSettings } from '@/services/bookkeeping';

/** Setting — language, display currency and the analysis cache. Cloud sync is on Profile. Simulate offline is on Profile. */
export default function SettingsScreen() {
  const { t } = useI18n();
  const { data: settings } = useLocalQuery(getSettings, []);
  const { data: currencyOpen } = useLocalQuery(canChangeCurrency, []);
  const dark = useAppTheme();

  const line =dark ? colors.dark.border : colors.neutral[200];
  const card = { borderRadius: radius.card, borderWidth: 1, borderColor: line, backgroundColor: dark ? colors.dark.surface : colors.white, paddingHorizontal: 16, paddingVertical: 2 } as const;
  const divider = (first?: boolean) => ({ borderTopWidth: first ? 0 : 1, borderTopColor: line });

  /** A section: a blue heading with its icon above a plain white card (as on Edit Profile). */
  const section = (heading: string, icon: IconName, children: React.ReactNode) => (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colors.dark.field : colors.primary[50] }}>
          <Icon name={icon} size={18} color={dark ? colors.dark.primary : colors.primary[500]} />
        </View>
        <Text variant="title" weight={700} tone="primary-900" accessibilityRole="header">{heading}</Text>
      </View>
      <View style={card}>{children}</View>
    </View>
  );

  /** A flag in a small round badge, to the left of a language name. */
  const flagBadge = (flag: React.ReactNode) => <View style={{ width: 28, height: 28, borderRadius: 14, overflow: 'hidden', marginRight: 12 }}>{flag}</View>;

  /** One choice in a list: the selected one carries a blue tick. */
  const option = (label: string, selected: boolean, onPress: () => void, first?: boolean, leading?: React.ReactNode) => (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className="flex-row items-center justify-between"
      style={{ minHeight: 52, ...divider(first) }}
    >
      {leading}
      <Text variant="body" weight={selected ? 600 : 400} tone={selected ? 'primary-900' : 'neutral-900'} style={{ flex: 1 }}>{label}</Text>
      {selected ? <Icon name="check" size={18} color={dark ? colors.dark.primary : colors.primary[500]} strokeWidth={2.5} /> : null}
    </Pressable>
  );

  // Business and owner details, and the policies, are on the Profile page; Settings is only how the app behaves.
  return (
    <ScreenShell title={t('profile.menu.settings')} nav="profile" padding={24}>
      <View style={{ gap: 24 }}>
        {section(t('settings.language'), 'book', <>
          {option('ភាសាខ្មែរ (Khmer)', settings?.language === 'km', () => updateSettings({ language: 'km' }), true, flagBadge(<CambodiaFlag size={28} />))}
          {option('English', settings?.language === 'en-GB', () => updateSettings({ language: 'en-GB' }), false, flagBadge(<UkFlag size={28} />))}
        </>)}

        {/* One currency for the whole business, no exchange rate. It can be switched only while nothing is recorded yet. */}
        {section(t('settings.currency'), 'dollar', currencyOpen ? <>
          {option('USD ($)', settings?.displayCurrency === 'USD', () => updateSettings({ displayCurrency: 'USD' }), true)}
          {option('KHR (៛)', settings?.displayCurrency === 'KHR', () => updateSettings({ displayCurrency: 'KHR' }))}
          <View style={{ paddingVertical: 10, ...divider() }}>
            <Text variant="caption" tone="neutral-600">{t('settings.currencyOpen')}</Text>
          </View>
        </> : <>
          <View style={{ minHeight: 52, justifyContent: 'center', gap: 2 }}>
            <Text variant="body" weight={600} tone="primary-900">{settings?.displayCurrency === 'KHR' ? 'KHR (៛)' : 'USD ($)'}</Text>
            <Text variant="caption" tone="neutral-600">{t('settings.currencyLocked')}</Text>
          </View>
        </>)}

        {section(t('settings.offlineTools'), 'wifiOff', <>
          {/* Simulate offline is on the Profile page, next to Plain language. */}
          <Pressable
            accessibilityRole="button"
            onPress={() => clearAnalysisCache().then(() => Alert.alert(t('settings.clearCache'), t('settings.cacheCleared')))}
            className="flex-row items-center justify-between"
            style={{ minHeight: 52 }}
          >
            <Text variant="body" weight={500} tone="primary-900">{t('settings.clearCache')}</Text>
            <Icon name="chevronRight" size={18} color={colors.neutral[500]} />
          </Pressable>
        </>)}
      </View>
    </ScreenShell>
  );
}
