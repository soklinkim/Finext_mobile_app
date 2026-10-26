import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { DateInput } from '@/components/DateInput';
import { OnboardingShell } from '@/components/OnboardingShell';
import { SelectField } from '@/components/SelectField';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n, type TKey } from '@/i18n';
import { colors, radius, tint } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';
import {
  completeOnboarding,
  convertMinor,
  formatAmountTyping,
  formatMoney,
  getSettings,
  listBanks,
  parseAmountInput,
  type Currency,
  type OnboardingAsset,
  type OnboardingFinancialEntry,
} from '@/services/bookkeeping';

interface BankRow {
  key: number;
  bankName: string;
  currency: Currency;
  amount: string;
}

type EntrySection = 'income' | 'assets' | 'liabilities' | 'equity';

const ASSET_FIELDS: { key: string; label: TKey; kind: OnboardingAsset['kind'] }[] = [
  { key: 'receivable', label: 'assets.receivable', kind: 'receivable' },
  { key: 'inventory', label: 'assets.inventory', kind: 'inventory' },
  { key: 'prepaid', label: 'assets.prepaid', kind: 'prepaid' },
  { key: 'equipment', label: 'assets.equipment', kind: 'equipment' },
  { key: 'other_long_term', label: 'assets.otherLongTerm', kind: 'other_long_term' },
];

const BALANCE_FIELDS: { key: string; label: TKey; section: 'balance_sheet' }[] = [
  { key: 'accounts_payable', label: 'assets.accountsPayable', section: 'balance_sheet' },
  { key: 'customer_deposits', label: 'assets.customerDeposits', section: 'balance_sheet' },
  { key: 'accrued_expenses', label: 'assets.accrued', section: 'balance_sheet' },
  { key: 'short_term_loans', label: 'assets.shortLoans', section: 'balance_sheet' },
  { key: 'other_short_borrowings', label: 'assets.otherBorrowings', section: 'balance_sheet' },
  { key: 'long_term_loans', label: 'assets.longLoans', section: 'balance_sheet' },
  { key: 'lease_obligations', label: 'assets.leases', section: 'balance_sheet' },
  { key: 'owner_capital', label: 'assets.ownerCapital', section: 'balance_sheet' },
  { key: 'retained_earnings', label: 'assets.retainedEarnings', section: 'balance_sheet' },
  { key: 'owner_drawings', label: 'assets.drawings', section: 'balance_sheet' },
];

const INCOME_FIELDS: { key: string; label: TKey; section: 'income_statement' }[] = [
  { key: 'sales_revenue', label: 'assets.salesRevenue', section: 'income_statement' },
  { key: 'cost_of_goods_sold', label: 'assets.costOfGoods', section: 'income_statement' },
  { key: 'salaries_wages', label: 'assets.salaries', section: 'income_statement' },
  { key: 'rent', label: 'assets.rent', section: 'income_statement' },
  { key: 'utilities', label: 'assets.utilities', section: 'income_statement' },
  { key: 'marketing_advertising', label: 'assets.marketing', section: 'income_statement' },
  { key: 'transport_delivery', label: 'assets.transport', section: 'income_statement' },
  { key: 'depreciation', label: 'assets.depreciation', section: 'income_statement' },
  { key: 'other_operating_expenses', label: 'assets.otherOperating', section: 'income_statement' },
  { key: 'other_income', label: 'assets.otherIncome', section: 'income_statement' },
  { key: 'interest_expense', label: 'assets.interest', section: 'income_statement' },
  { key: 'income_tax', label: 'assets.incomeTax', section: 'income_statement' },
];

const entryPanelStyle = {
  backgroundColor: tint(colors.primary[200], 0.12),
  borderRadius: radius.lg,
  padding: 16,
  gap: 12,
};

function addOneMonth(ms: number): number {
  const date = new Date(ms);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return date.getTime();
}

/** Collect opening balance sheet values for all users and period income for existing businesses. */
export default function Assets() {
  const router = useRouter();
  const { t } = useI18n();
  const dark = useAppTheme();
  const { data: settings } = useLocalQuery(getSettings, []);
  const { data: banks } = useLocalQuery(listBanks, []);
  const existing = settings?.startOption === 'existing';
  const currency: Currency = settings?.displayCurrency ?? 'USD';
  const sections: EntrySection[] = existing ? ['income', 'assets', 'liabilities', 'equity'] : ['assets', 'liabilities', 'equity'];

  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [rows, setRows] = useState<BankRow[]>([{ key: 1, bankName: '', currency, amount: '' }]);
  const [assets, setAssets] = useState<Record<string, { currency: Currency; amount: string }>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const bankOptions = (banks ?? []).map((bank) => ({ value: bank.name, label: bank.name }));
  const panelStyle = { ...entryPanelStyle, backgroundColor: dark ? colors.dark.surface : entryPanelStyle.backgroundColor };
  const setAssetAmount = (key: string, value: string) =>
    setAssets((old) => ({
      ...old,
      [key]: {
        currency: old[key]?.currency ?? currency,
        amount: formatAmountTyping(value, old[key]?.currency ?? currency),
      },
    }));
  const setAmount = (key: string, value: string) => setAmounts((old) => ({ ...old, [key]: formatAmountTyping(value, currency) }));

  const dateError = existing && start && end
    ? end <= start
      ? t('error.endAfterStart')
      : end < addOneMonth(start)
        ? t('error.periodShort')
        : undefined
    : undefined;
  const currentSection = sections[sectionIndex] ?? 'assets';
  const sectionTitle: Record<EntrySection, string> = {
    income: t('assets.performanceTitle'),
    assets: t('assets.balanceAssets'),
    liabilities: t('assets.liabilities'),
    equity: t('assets.equity'),
  };
  const hasCashBalance = rows.some((row) => row.amount.trim());
  const hasEveryAssetCategory = ASSET_FIELDS.every((field) => assets[field.key]?.amount.trim());
  const hasEveryLiability = BALANCE_FIELDS.slice(0, 7).every((field) => amounts[field.key]?.trim());
  const hasEveryEquity = BALANCE_FIELDS.slice(7).every((field) => amounts[field.key]?.trim());
  const incomeNet = INCOME_FIELDS.reduce((total, field) => {
    const value = parseAmountInput(amounts[field.key] ?? '', currency);
    if (field.key === 'sales_revenue' || field.key === 'other_income') return total + value;
    return total - value;
  }, 0);

  // Opening balance check, matching the server's rule (assets = liabilities + owner's equity).
  // Without it, unbalanced figures were accepted here and every report failed afterwards.
  const rate = settings?.rateKhrPerUsd ?? 4000;
  const amountOf = (key: string) => parseAmountInput(amounts[key] ?? '', currency);
  const totalAssets =
    rows.reduce((sum, row) => sum + convertMinor(parseAmountInput(row.amount, row.currency), row.currency, currency, rate), 0) +
    ASSET_FIELDS.reduce((sum, field) => {
      const asset = assets[field.key];
      const assetCurrency = asset?.currency ?? currency;
      return sum + convertMinor(parseAmountInput(asset?.amount ?? '', assetCurrency), assetCurrency, currency, rate);
    }, 0);
  const totalLiabilities = BALANCE_FIELDS.slice(0, 7).reduce((sum, field) => sum + amountOf(field.key), 0);
  const totalEquity = amountOf('owner_capital') + amountOf('retained_earnings') + incomeNet - amountOf('owner_drawings');
  const balanceDifference = totalAssets - totalLiabilities - totalEquity;
  // Allow for rounding when KHR amounts are converted (the server allows one minor unit per line).
  const isBalanced = Math.abs(balanceDifference) <= rows.length + BALANCE_FIELDS.length + ASSET_FIELDS.length + 2;
  const balancingCapital = amountOf('owner_capital') + balanceDifference;

  const finish = async () => {
    setError(undefined);
    if (existing && (!start || !end)) return setError(t('error.required'));
    if (dateError) return setError(dateError);

    if (!hasCashBalance || !hasEveryAssetCategory || !hasEveryLiability || !hasEveryEquity) return setError(t('assets.balanceRequired'));
    if (existing && !INCOME_FIELDS.every((field) => amounts[field.key]?.trim())) return setError(t('assets.incomeRequired'));
    if (!isBalanced) return setError(t('assets.unbalancedError'));

    setSaving(true);
    try {
      const asOf = existing ? end! : Date.now();
      const assetEntries: OnboardingAsset[] = [];
      const addAsset = (kind: OnboardingAsset['kind'], name: string, value: string, cur: Currency, bankName?: string) => {
        const amount = parseAmountInput(value, cur);
        if (amount > 0) assetEntries.push({ kind, name, bankName, amount, currency: cur });
      };
      for (const row of rows) {
        const name = row.bankName.trim() || t('assets.cash');
        addAsset('cash_bank', name, row.amount, row.currency, name);
      }
      for (const field of ASSET_FIELDS) {
        const asset = assets[field.key];
        addAsset(field.kind, t(field.label), asset?.amount ?? '', asset?.currency ?? currency);
      }

      const financialEntries: OnboardingFinancialEntry[] = [];
      const addFinancial = (section: OnboardingFinancialEntry['section'], key: string, amount: number, cur: Currency) => {
        financialEntries.push({
          section,
          entryKey: key,
          amount,
          currency: cur,
          asOf,
          ...(section === 'income_statement' && start && end ? { periodStart: start, periodEnd: end } : {}),
        });
      };
      const cashByCurrency: Record<Currency, number> = { KHR: 0, USD: 0 };
      for (const row of rows) {
        cashByCurrency[row.currency] += parseAmountInput(row.amount, row.currency);
      }
      addFinancial('balance_sheet', 'cash_bank', cashByCurrency.KHR, 'KHR');
      addFinancial('balance_sheet', 'cash_bank', cashByCurrency.USD, 'USD');
      for (const field of ASSET_FIELDS) {
        const asset = assets[field.key];
        const assetCurrency = asset?.currency ?? currency;
        addFinancial('balance_sheet', field.key, parseAmountInput(asset?.amount ?? '', assetCurrency), assetCurrency);
      }
      for (const field of BALANCE_FIELDS) {
        const value = amounts[field.key];
        if (value?.trim()) addFinancial('balance_sheet', field.key, parseAmountInput(value, currency), currency);
      }
      addFinancial('balance_sheet', 'net_profit_for_period', incomeNet, currency);
      if (existing) {
        for (const field of INCOME_FIELDS) {
          const value = amounts[field.key];
          if (value?.trim()) addFinancial('income_statement', field.key, parseAmountInput(value, currency), currency);
        }
      }

      await completeOnboarding({
        startOption: settings?.startOption ?? 'new',
        profile: {},
        assets: assetEntries,
        financialEntries,
        asOf,
      });
      router.replace('/home');
    } finally {
      setSaving(false);
    }
  };

  const continueSection = () => {
    setError(undefined);
    if (currentSection === 'income') {
      if (!start || !end) return setError(t('error.required'));
      if (dateError) return setError(dateError);
      if (!INCOME_FIELDS.every((field) => amounts[field.key]?.trim())) return setError(t('assets.incomeRequired'));
    } else if (currentSection === 'assets') {
      if (!hasCashBalance || !hasEveryAssetCategory) return setError(t('assets.balanceRequired'));
    } else if (currentSection === 'liabilities' && !hasEveryLiability) {
      return setError(t('assets.balanceRequired'));
    } else if (currentSection === 'equity' && !hasEveryEquity) {
      return setError(t('assets.balanceRequired'));
    }

    if (sectionIndex === sections.length - 1) void finish();
    else setSectionIndex((index) => index + 1);
  };

  const assetCurrencyField = (key: string, label: TKey) => (
    <View key={key} style={{ gap: 8 }}>
      <Text variant="body" tone="primary-900">{t(label)}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 112 }}>
          <SelectField
            size="form"
            placeholder={t('assets.currency')}
            options={[{ value: 'KHR', label: 'KHR' }, { value: 'USD', label: 'USD' }]}
            value={assets[key]?.currency ?? currency}
            onChange={(selectedCurrency) => setAssets((old) => ({
              ...old,
              [key]: {
                currency: selectedCurrency,
                amount: formatAmountTyping(old[key]?.amount ?? '', selectedCurrency),
              },
            }))}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            variant="form"
            value={assets[key]?.amount ?? ''}
            onChangeText={(value) => setAssetAmount(key, value)}
            keyboardType="decimal-pad"
            placeholder="0"
          />
        </View>
      </View>
    </View>
  );

  const financialField = (field: { key: string; label: TKey }) => (
    <TextField
      key={field.key}
      variant="form"
      label={t(field.label)}
      value={amounts[field.key] ?? ''}
      onChangeText={(value) => setAmount(field.key, value)}
      keyboardType="decimal-pad"
      placeholder="0"
      right={<Text variant="body-sm" weight={500}>{currency}</Text>}
    />
  );

  return (
    <OnboardingShell
      title={sectionTitle[currentSection]}
      subtitle={
        currentSection === 'income'
          ? t('assets.performanceSubtitle')
          : currentSection === 'assets'
            ? t('assets.assetSubtitle')
            : currentSection === 'liabilities'
              ? t('assets.liabilitiesSubtitle')
              : t('assets.equitySubtitle')
      }
      step={4}
      form
    >
      <View style={{ gap: 20 }}>
        <Text variant="caption" tone="neutral-600">{t('assets.sectionProgress', { current: sectionIndex + 1, total: sections.length })}</Text>
        {currentSection === 'income' && (
          <View style={{ gap: 12 }}>
            <Text variant="caption" tone="neutral-600">{t('assets.zeroIfNone')}</Text>
            <View style={panelStyle}>
              <DateInput label={t('assets.startDate')} value={start} onChange={setStart} error={error && !start ? error : undefined} />
              <DateInput label={t('assets.endDate')} value={end} onChange={setEnd} error={dateError ?? (error && !end ? error : undefined)} />
            </View>
            <View style={panelStyle}>
              <Text variant="body-lg" weight={700} tone="primary-900">{t('assets.revenue')}</Text>
              {INCOME_FIELDS.slice(0, 2).map(financialField)}
            </View>
            <View style={panelStyle}>
              <Text variant="body-lg" weight={700} tone="primary-900">{t('assets.operatingExpenses')}</Text>
              {INCOME_FIELDS.slice(2).map(financialField)}
            </View>
          </View>
        )}

        {currentSection === 'assets' && (
          <View style={{ gap: 16 }}>
        <Text variant="caption" tone="neutral-600">{t('assets.zeroIfNone')}</Text>
        {existing && <Text variant="caption" tone="neutral-600">{`${t('assets.endDate')}: ${end ? new Date(end).toLocaleDateString() : '—'}`}</Text>}
        <View style={panelStyle}>
        <Text variant="body-lg" weight={700} tone="primary-900">{t('assets.current')}</Text>
        <Text variant="body" tone="primary-900">{t('assets.cashBank')}</Text>
        <Text variant="caption" tone="neutral-600">{t('assets.bankBalanceNote')}</Text>
        {rows.map((row) => (
          <View
            key={row.key}
            style={{
              gap: 14,
              padding: 12,
              borderRadius: radius.md,
              backgroundColor: dark ? colors.dark.field : colors.white,
              borderWidth: 1,
              borderColor: dark ? colors.dark.border : colors.primary[200],
            }}
          >
            <SelectField variant="chip" placeholder={t('assets.selectBank')} options={bankOptions} value={row.bankName || null} onChange={(bankName) => setRows((old) => old.map((r) => r.key === row.key ? { ...r, bankName } : r))} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 112 }}>
                <SelectField
                  size="form"
                  placeholder={t('assets.currency')}
                  options={[{ value: 'KHR', label: 'KHR' }, { value: 'USD', label: 'USD' }]}
                  value={row.currency}
                  onChange={(selectedCurrency) => setRows((old) => old.map((r) => r.key === row.key ? { ...r, currency: selectedCurrency } : r))}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  variant="form"
                  value={row.amount}
                  onChangeText={(amount) => setRows((old) => old.map((r) => r.key === row.key ? { ...r, amount: formatAmountTyping(amount, r.currency) } : r))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                />
              </View>
            </View>
          </View>
        ))}
        <Text variant="body-sm" weight={500} tone="primary-900" style={{ textAlign: 'center' }} onPress={() => setRows((old) => [...old, { key: old.length + 1, bankName: '', currency, amount: '' }])} accessibilityRole="button">{t('assets.addBank')}</Text>
        {ASSET_FIELDS.slice(0, 3).map((field) => assetCurrencyField(field.key, field.label))}
        </View>

        <View style={panelStyle}>
        <Text variant="body-lg" weight={700} tone="primary-900">{t('assets.nonCurrent')}</Text>
        {ASSET_FIELDS.slice(3).map((field) => assetCurrencyField(field.key, field.label))}
        </View>
          </View>
        )}

        {currentSection === 'liabilities' && (
          <View style={{ gap: 16 }}>
            <Text variant="caption" tone="neutral-600">{t('assets.zeroIfNone')}</Text>
            <View style={panelStyle}>
            <Text variant="body-lg" weight={700} tone="primary-900">{t('assets.currentLiabilities')}</Text>
            {BALANCE_FIELDS.slice(0, 5).map(financialField)}
            </View>
            <View style={panelStyle}>
            <Text variant="body-lg" weight={700} tone="primary-900">{t('assets.nonCurrentLiabilities')}</Text>
            {BALANCE_FIELDS.slice(5, 7).map(financialField)}
            </View>
          </View>
        )}

        {currentSection === 'equity' && (
          <View style={{ gap: 16 }}>
            <Text variant="caption" tone="neutral-600">{t('assets.zeroIfNone')}</Text>
            <View style={panelStyle}>
            {BALANCE_FIELDS.slice(7).map(financialField)}
            <Text variant="body" tone="primary-900">{t('assets.periodProfit')}: {formatMoney(incomeNet, currency)}</Text>
            </View>
            <View
              accessibilityRole="summary"
              style={{ ...panelStyle, borderWidth: 1, borderColor: isBalanced ? colors.success : colors.warning, backgroundColor: dark ? colors.dark.surface : tint(isBalanced ? colors.success : colors.warning, 0.12) }}
            >
              <Text variant="body-lg" weight={700} tone="primary-900">{t('assets.balanceCheck')}</Text>
              {[
                { label: t('assets.totalAssets'), value: totalAssets },
                { label: t('assets.totalLiabilities'), value: totalLiabilities },
                { label: t('assets.totalEquity'), value: totalEquity },
              ].map((line) => (
                <View key={line.label} className="flex-row justify-between">
                  <Text variant="body-sm" tone="primary-900">{line.label}</Text>
                  <Text variant="body-sm" weight={600} tone="primary-900">{formatMoney(line.value, currency)}</Text>
                </View>
              ))}
              <Text variant="body-sm" weight={600} tone={isBalanced ? 'primary-900' : 'danger'}>
                {isBalanced ? t('assets.balanced') : t('assets.unbalanced', { amount: formatMoney(Math.abs(balanceDifference), currency) })}
              </Text>
              {!isBalanced && (
                <>
                  <Text variant="caption" tone="neutral-600">{t('assets.unbalancedHint')}</Text>
                  {balancingCapital >= 0 && (
                    <Button
                      variant="soft"
                      label={t('assets.useCapital', { amount: formatMoney(balancingCapital, currency) })}
                      onPress={() => setAmount('owner_capital', (balancingCapital / (currency === 'USD' ? 100 : 1)).toFixed(currency === 'USD' ? 2 : 0))}
                    />
                  )}
                </>
              )}
            </View>
          </View>
        )}
        {error ? <Text variant="caption" tone="danger">{error}</Text> : null}
        <View className="flex-row" style={{ gap: 12, marginTop: 8 }}>
          {sectionIndex > 0 && (
            <Button variant="soft" className="flex-1" label={t('common.back')} onPress={() => { setError(undefined); setSectionIndex((index) => index - 1); }} />
          )}
          <Button
            variant="primary"
            className={sectionIndex > 0 ? 'flex-1' : 'w-full'}
            label={sectionIndex === sections.length - 1 ? t('assets.finish') : t('common.next')}
            trailingIcon={sectionIndex === sections.length - 1 ? undefined : 'chevronRight'}
            loading={saving}
            onPress={continueSection}
          />
        </View>
      </View>
    </OnboardingShell>
  );
}
