import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { PickerModal } from '@/components/PickerModal';
import { ScreenShell } from '@/components/ScreenShell';
import { EmptyState, LoadingState } from '@/components/StateViews';
import { SummaryHero } from '@/components/SummaryHero';
import { Text } from '@/components/Text';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n, type TKey } from '@/i18n';
import { formatInputDate, MONTHS } from '@/lib/format';
import { colors } from '@/theme';
import { formatMoney, getMonthOverview, GROUPS, type OverviewGroup } from '@/services/bookkeeping';

function GroupRow({ group, currency, locale }: { group: OverviewGroup; currency: 'KHR' | 'USD'; locale: 'en-GB' | 'km' }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(group.groupId === 'monthly');
  const label = GROUPS[group.groupId as keyof typeof GROUPS]?.labelKey ?? 'group.monthly';
  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((v) => !v)} className="flex-row items-center justify-between" style={{ minHeight: 56, paddingVertical: 8 }}>
        <View>
          <Text variant="body" weight={600} tone="primary-900">
            {t(label as TKey)}
          </Text>
          <Text variant="caption" weight={300} tone="neutral-600">
            {t('overview.entries', { count: group.entries.length })}
          </Text>
        </View>
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <Text variant="body" weight={700} tone="primary-900">
            {formatMoney(group.total, currency, { showPlus: true })}
          </Text>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={18} />
        </View>
      </Pressable>
      {open &&
        group.entries.map((e) => (
          <View key={e.id} className="flex-row items-center justify-between" style={{ paddingLeft: 14, minHeight: 48 }}>
            <View className="flex-1">
              <Text variant="body-sm" weight={500} tone="neutral-900" numberOfLines={1}>
                {e.title}
              </Text>
              <Text variant="caption" weight={300} tone="neutral-600">
                {formatInputDate(e.occurredAt)}
              </Text>
            </View>
            <Text variant="body-sm" weight={500} tone={e.direction === 'out' ? 'expense' : 'primary-900'}>
              {formatMoney(e.signed, e.currency)}
            </Text>
          </View>
        ))}
    </View>
  );
}

/** Bookkeeping overview — grouped list for the chosen month plus "Add an entry". */
export default function Bookkeeping() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [picker, setPicker] = useState(false);
  const { data, loading } = useLocalQuery(() => getMonthOverview(cursor.year, cursor.month), [cursor.year, cursor.month]);

  // last 12 months for the month picker
  const options = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { value: d.getFullYear() * 12 + d.getMonth(), label: `${MONTHS[locale][d.getMonth()]} ${d.getFullYear()}` };
  });

  return (
    <ScreenShell title={t('screen.bookkeeping')} nav="bookkeeping" hero={<SummaryHero />} padding={24}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('overview.month')}
        onPress={() => setPicker(true)}
        className="flex-row items-center self-start rounded-pill bg-primary-50"
        style={{ paddingHorizontal: 14, minHeight: 36, gap: 8, marginBottom: 16 }}
      >
        <Icon name="calendar" size={16} color={colors.primary[500]} />
        <Text variant="body-sm" weight={500} tone="primary-900">
          {MONTHS[locale][cursor.month]} {cursor.year}
        </Text>
        <Icon name="chevronDown" size={14} />
      </Pressable>

      <View className="bg-white border border-neutral-200 rounded-xl" style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
        {loading && !data ? <LoadingState /> : null}
        {data && data.groups.length === 0 ? <EmptyState titleKey="overview.empty" bodyKey="tx.emptyBody" /> : null}
        {data?.groups.map((g, i) => (
          <View key={g.groupId} className={i > 0 ? 'border-t border-neutral-200' : ''}>
            <GroupRow group={g} currency={data.currency} locale={locale} />
          </View>
        ))}
      </View>
      <Text variant="micro" weight={300} tone="neutral-600" style={{ marginTop: 8, marginBottom: 16 }}>
        {t('overview.moveNote')}
      </Text>

      <View style={{ gap: 12 }}>
        <Button label={t('overview.addEntry')} icon="plus" onPress={() => router.push('/add-entry')} />
        <View className="flex-row" style={{ gap: 12 }}>
          <View className="flex-1">
            <Button variant="soft" label={t('screen.transactions')} onPress={() => router.push('/transactions')} />
          </View>
          <View className="flex-1">
            <Button variant="soft" label={t('screen.categories')} onPress={() => router.push('/categories')} />
          </View>
        </View>
        <Button variant="soft" label={t('screen.savings')} onPress={() => router.push('/savings')} />
      </View>

      <PickerModal
        visible={picker}
        title={t('overview.month')}
        options={options}
        value={cursor.year * 12 + cursor.month}
        onSelect={(v) => setCursor({ year: Math.floor(v / 12), month: v % 12 })}
        onClose={() => setPicker(false)}
      />
    </ScreenShell>
  );
}
