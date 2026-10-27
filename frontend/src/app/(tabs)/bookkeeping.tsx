import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { Icon, type IconName } from '@/components/Icon';
import { KpiTile } from '@/components/KpiTile';
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
import { useAppTheme } from '@/theme/AppTheme';

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

function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View className="flex-row items-center justify-between" style={{ marginBottom: 8 }}>
      <Text variant="body" weight={700} tone="primary-900">{title}</Text>
      {action && onAction ? (
        <Pressable accessibilityRole="link" accessibilityLabel={action} onPress={onAction} hitSlop={8} className="flex-row items-center" style={{ gap: 2, minHeight: 32 }}>
          <Text variant="caption" weight={600} tone="primary-500">{action}</Text>
          <Icon name="chevronRight" size={14} color={colors.primary[500]} />
        </Pressable>
      ) : null}
    </View>
  );
}

function ToolRow({ icon, title, body, onPress, first }: { icon: IconName; title: string; body: string; onPress: () => void; first?: boolean }) {
  const dark = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      onPress={onPress}
      className={`flex-row items-center ${first ? '' : 'border-t border-neutral-200'}`}
      style={{ gap: 12, minHeight: 64, paddingVertical: 10, ...(dark ? { borderColor: colors.dark.border } : {}) }}
    >
      <View className="items-center justify-center rounded-lg bg-primary-50" style={{ width: 40, height: 40, ...(dark ? { backgroundColor: colors.dark.field } : {}) }}>
        <Icon name={icon} size={20} color={colors.primary[500]} />
      </View>
      <View className="flex-1" style={{ gap: 2 }}>
        <Text variant="body" weight={600} tone="primary-900">{title}</Text>
        <Text variant="caption" weight={300} tone="neutral-600">{body}</Text>
      </View>
      <Icon name="chevronRight" size={18} color={colors.neutral[500]} />
    </Pressable>
  );
}

/**
 * Bookkeeping overview, top to bottom in the order people use it:
 * pick a month → see what came in and went out → add an entry → review entries → other tools.
 * Everything here reads the local database, so it works offline.
 */
export default function Bookkeeping() {
  const router = useRouter();
  const dark = useAppTheme();
  const { t, locale } = useI18n();
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [picker, setPicker] = useState(false);
  const { data, loading } = useLocalQuery(() => getMonthOverview(cursor.year, cursor.month), [cursor.year, cursor.month]);
  const currency = data?.currency ?? 'USD';
  const monthLabel = `${MONTHS[locale][cursor.month]} ${cursor.year}`;
  // Group totals are signed in the display currency; transfers are already excluded.
  const isIn = (g: OverviewGroup) => GROUPS[g.groupId as keyof typeof GROUPS]?.direction === 'in';
  const moneyIn = (data?.groups ?? []).filter(isIn).reduce((sum, g) => sum + g.total, 0);
  const moneyOut = (data?.groups ?? []).filter((g) => !isIn(g)).reduce((sum, g) => sum - g.total, 0);

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
        style={{ paddingHorizontal: 14, minHeight: 36, gap: 8, marginBottom: 16, ...(dark ? { backgroundColor: colors.dark.surface } : {}) }}
      >
        <Icon name="calendar" size={16} color={colors.primary[500]} />
        <Text variant="body-sm" weight={500} tone="primary-900">
          {monthLabel}
        </Text>
        <Icon name="chevronDown" size={14} />
      </Pressable>

      {/* 1. What happened this month */}
      <View className="flex-row" style={{ gap: 8 }}>
        <KpiTile label={t('overview.moneyIn')} value={formatMoney(moneyIn, currency)} />
        <KpiTile label={t('overview.moneyOut')} value={formatMoney(moneyOut, currency)} />
        <KpiTile label={t('overview.leftOver')} value={formatMoney(moneyIn - moneyOut, currency, { showPlus: true })} highlight />
      </View>
      <Text variant="micro" weight={300} tone="neutral-600" style={{ marginTop: 8, marginBottom: 16 }}>
        {t('overview.moveNote')}
      </Text>

      {/* 2. The main action */}
      <Button label={t('overview.addEntry')} icon="plus" onPress={() => router.push('/add-entry')} />

      {/* 3. This month's entries */}
      <View style={{ marginTop: 28 }}>
        <SectionHeader title={t('overview.entriesTitle', { month: monthLabel })} action={t('overview.seeAll')} onAction={() => router.push('/transactions')} />
        <View className="bg-white border border-neutral-200 rounded-xl" style={{ paddingHorizontal: 16, paddingVertical: 4, ...(dark ? { backgroundColor: colors.dark.surface } : {}), ...(dark ? { borderColor: colors.dark.border } : {}) }}>
          {loading && !data ? <LoadingState /> : null}
          {data && data.groups.length === 0 ? <EmptyState titleKey="overview.empty" bodyKey="overview.emptyBody" /> : null}
          {data?.groups.map((g, i) => (
            <View key={g.groupId} className={i > 0 ? 'border-t border-neutral-200' : ''}>
              <GroupRow group={g} currency={data.currency} locale={locale} />
            </View>
          ))}
        </View>
      </View>

      {/* 4. Everything else, each with a one-line explanation */}
      <View style={{ marginTop: 28 }}>
        <SectionHeader title={t('overview.toolsTitle')} />
        <View className="bg-white border border-neutral-200 rounded-xl" style={{ paddingHorizontal: 16, ...(dark ? { backgroundColor: colors.dark.surface } : {}), ...(dark ? { borderColor: colors.dark.border } : {}) }}>
          <ToolRow first icon="tag" title={t('screen.categories')} body={t('overview.categoriesBody')} onPress={() => router.push('/categories')} />
          <ToolRow icon="savings" title={t('screen.savings')} body={t('overview.savingsBody')} onPress={() => router.push('/savings')} />
          <ToolRow icon="book" title={t('bookkeeping.journal')} body={t('overview.journalBody')} onPress={() => router.push('/journal')} />
        </View>
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
