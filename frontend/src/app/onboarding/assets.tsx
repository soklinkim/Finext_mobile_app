import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Keyboard, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { DateInput } from '@/components/DateInput';
import { FieldLabel } from '@/components/FieldLabel';
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
  amountToInput,
  formatAmountTyping,
  formatMoney,
  getSettings,
  listBanks,
  parseAmountInput,
  type Currency,
  type OnboardingAsset,
  type OnboardingFinancialEntry,
} from '@/services/bookkeeping';

/** Picker value for "Other bank / MFI": the name is typed instead of chosen. */
const OTHER_BANK = '__other__';

interface BankRow {
  key: number;
  bankName: string;
  /** the bank is not in the list; bankName holds the typed name */
  custom?: boolean;
  currency: Currency;
  amount: string;
}

type EntrySection = 'income' | 'assets' | 'liabilities' | 'equity';

const ASSET_FIELDS: { key: string; label: TKey; kind: OnboardingAsset['kind'] }[] = [
  { key: 'receivable', label: 'assets.receivable', kind: 'receivable' },
  { key: 'inventory', label: 'assets.inventory', kind: 'inventory' },
  { key: 'prepaid', label: 'assets.prepaid', kind: 'prepaid' },
  // Property, equipment and vehicles are entered apart but all count as property, plant & equipment (kind 'equipment').
  { key: 'property', label: 'assets.property', kind: 'equipment' },
  { key: 'equipment', label: 'assets.equipmentOnly', kind: 'equipment' },
  { key: 'vehicles', label: 'assets.vehicles', kind: 'equipment' },
];

/** An extra long-term thing the owner adds by name (a patent, a deposit, livestock...). */
interface OtherAsset {
  key: number;
  name: string;
  amount: string;
}

/** One loan from one lender; a business can borrow from several banks / MFIs at once. */
interface LoanRow {
  key: number;
  /** the chosen bank / MFI, or OTHER_BANK when the name is typed into `lender` */
  bank: string | null;
  lender: string;
  amount: string;
}
type LoanKey = 'short_term_loans' | 'long_term_loans';
const LOAN_KEYS: LoanKey[] = ['short_term_loans', 'long_term_loans'];

const BALANCE_FIELDS: { key: string; label: TKey; section: 'balance_sheet' }[] = [
  { key: 'accounts_payable', label: 'assets.accountsPayable', section: 'balance_sheet' },
  { key: 'customer_deposits', label: 'assets.customerDeposits', section: 'balance_sheet' },
  { key: 'accrued_expenses', label: 'assets.accrued', section: 'balance_sheet' },
  // Entered apart from bills, but the ledger holds one figure for both (accrued_expenses); see finish().
  { key: 'taxes_payable', label: 'assets.taxesPayable', section: 'balance_sheet' },
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

/** The last text field of a section, which gets "Done" on the keyboard instead of "Next". */
function lastFieldOf(section: EntrySection, otherAssets: OtherAsset[]): string {
  if (section === 'income') return 'amt:income_tax';
  if (section === 'assets') return otherAssets.length ? `other:${otherAssets[otherAssets.length - 1].key}` : 'asset:vehicles';
  if (section === 'liabilities') return 'amt:lease_obligations';
  return 'amt:owner_drawings';
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
  const [loans, setLoans] = useState<Record<LoanKey, LoanRow[]>>({
    short_term_loans: [{ key: 1, bank: null, lender: '', amount: '' }],
    long_term_loans: [{ key: 1, bank: null, lender: '', amount: '' }],
  });
  const [otherAssets, setOtherAssets] = useState<OtherAsset[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  // One currency for the whole business (chosen at setup); keep every row in it once settings have loaded.
  useEffect(() => {
    setRows((old) => old.map((r) => ({ ...r, currency })));
    setAssets((old) => Object.fromEntries(Object.entries(old).map(([k, v]) => [k, { currency, amount: formatAmountTyping(v.amount, currency) }])));
  }, [currency]);

  const bankOptions = (banks ?? []).map((bank) => ({ value: bank.name, label: bank.name }));
  const lenderBankOptions = (banks ?? []).filter((bank) => bank.kind === 'bank').map((bank) => ({ value: bank.name, label: bank.name }));
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

  // Keyboard "Next": every text field registers itself in the order it is drawn, so pressing Next on the phone keyboard
  // moves the cursor to the next field of the screen (and the last one says Done and closes the keyboard).
  const inputs = useRef<Record<string, ComponentRef<typeof TextInput> | null>>({});
  const order: string[] = [];
  const lastFieldId = lastFieldOf(sections[sectionIndex] ?? 'assets', otherAssets);
  const chain = (id: string) => {
    order.push(id);
    return {
      fieldRef: (node: ComponentRef<typeof TextInput> | null) => { inputs.current[id] = node; },
      returnKeyType: id === lastFieldId ? ('done' as const) : ('next' as const),
      // keep the keyboard open when Next is pressed so it does not flicker between fields
      submitBehavior: 'submit' as const,
      onSubmitEditing: () => {
        const next = order.slice(order.indexOf(id) + 1).find((key) => inputs.current[key]);
        if (next) inputs.current[next]?.focus();
        else Keyboard.dismiss();
      },
    };
  };

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
  /** Puts 0 in every empty field of this section (typed values stay), for items that do not apply to the business. */
  const fillZeros = () => {
    setError(undefined);
    if (currentSection === 'assets') {
      setRows((old) => old.map((r) => (r.amount.trim() ? r : { ...r, amount: '0' })));
      setAssets((old) => {
        const next = { ...old };
        for (const field of ASSET_FIELDS) if (!next[field.key]?.amount.trim()) next[field.key] = { currency: next[field.key]?.currency ?? currency, amount: '0' };
        return next;
      });
      return;
    }
    const fields = currentSection === 'income' ? INCOME_FIELDS : currentSection === 'liabilities' ? BALANCE_FIELDS.slice(0, 8) : BALANCE_FIELDS.slice(8);
    setAmounts((old) => {
      const next = { ...old };
      for (const field of fields) if (!next[field.key]?.trim()) next[field.key] = '0';
      return next;
    });
    if (currentSection === 'liabilities') {
      setLoans((old) => {
        const next = { ...old };
        for (const key of LOAN_KEYS) next[key] = old[key].map((r) => (r.amount.trim() ? r : { ...r, amount: '0' }));
        return next;
      });
    }
  };
  const zeroHint = (
    <View style={{ gap: 8 }}>
      <Text variant="caption" tone="neutral-600">{t('assets.zeroIfNone')}</Text>
      <Button variant="soft" size="sm" label={t('assets.fillZeros')} onPress={fillZeros} />
    </View>
  );

  const hasCashBalance = rows.some((row) => row.amount.trim());
  const hasEveryAssetCategory = ASSET_FIELDS.every((field) => assets[field.key]?.amount.trim());
  const hasEveryLiability = BALANCE_FIELDS.slice(0, 8).every((field) => amounts[field.key]?.trim());
  const hasEveryEquity = BALANCE_FIELDS.slice(8).every((field) => amounts[field.key]?.trim());
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
    }, 0) +
    otherAssets.reduce((sum, other) => sum + parseAmountInput(other.amount, currency), 0);
  const totalLiabilities = BALANCE_FIELDS.slice(0, 8).reduce((sum, field) => sum + amountOf(field.key), 0);
  const totalEquity = amountOf('owner_capital') + amountOf('retained_earnings') + incomeNet - amountOf('owner_drawings');
  const balanceDifference = totalAssets - totalLiabilities - totalEquity;
  // Allow for rounding when KHR amounts are converted (the server allows one minor unit per line).
  const isBalanced = Math.abs(balanceDifference) <= rows.length + BALANCE_FIELDS.length + ASSET_FIELDS.length + otherAssets.length + 2;
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
      for (const other of otherAssets) {
        if (other.amount.trim()) addAsset('other_long_term', other.name.trim() || t('assets.otherLongTerm'), other.amount, currency);
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
      // The ledger holds one figure each for receivables, inventory, prepaid, property/equipment/vehicles and other long-term assets.
      const assetTotals: Record<string, number> = { receivable: 0, inventory: 0, prepaid: 0, equipment: 0, other_long_term: 0 };
      for (const field of ASSET_FIELDS) {
        const asset = assets[field.key];
        assetTotals[field.kind] += parseAmountInput(asset?.amount ?? '', asset?.currency ?? currency);
      }
      for (const other of otherAssets) assetTotals.other_long_term += parseAmountInput(other.amount, currency);
      for (const [key, total] of Object.entries(assetTotals)) addFinancial('balance_sheet', key, total, currency);
      for (const field of BALANCE_FIELDS) {
        if (field.key === 'taxes_payable') continue; // folded into accrued_expenses below
        const value = amounts[field.key];
        if (!value?.trim()) continue;
        const extra = field.key === 'accrued_expenses' ? amountOf('taxes_payable') : 0;
        addFinancial('balance_sheet', field.key, parseAmountInput(value, currency) + extra, currency);
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
      <FieldLabel label={t(label)} variant="body" tone="primary-900" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text variant="body" weight={600} tone="primary-900">{currency}</Text>
        <View style={{ flex: 1 }}>
          <TextField
            variant="form"
            outlined
            value={assets[key]?.amount ?? ''}
            onChangeText={(value) => setAssetAmount(key, value)}
            keyboardType="decimal-pad"
            placeholder="0"
            {...chain(`asset:${key}`)}
          />
        </View>
      </View>
    </View>
  );

  /** Edit one lender's row, then keep the loan total (what the checks and the ledger use) in step with the rows. */
  const updateLoans = (key: LoanKey, change: (rows: LoanRow[]) => LoanRow[]) => {
    const next = change(loans[key]);
    setLoans((old) => ({ ...old, [key]: next }));
    const filled = next.some((r) => r.amount.trim());
    const total = next.reduce((sum, r) => sum + parseAmountInput(r.amount, currency), 0);
    setAmounts((old) => ({ ...old, [key]: filled ? (total === 0 ? '0' : amountToInput(total, currency)) : '' }));
  };

  const loanField = (field: { key: string; label: TKey }) => {
    const key = field.key as LoanKey;
    const list = loans[key];
    return (
      <View key={key} style={{ gap: 10 }}>
        <FieldLabel label={t(field.label)} variant="body" tone="primary-900" />
        {list.map((row) => (
          <View key={row.key} style={{ gap: 8, padding: 10, borderRadius: radius.md, backgroundColor: dark ? colors.dark.field : colors.white, borderWidth: 1, borderColor: dark ? colors.dark.border : colors.primary[200] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <SelectField
                variant="chip"
                placeholder={t('entry.lenderBank')}
                searchable
                options={[...lenderBankOptions, { value: OTHER_BANK, label: t('entry.otherLender') }]}
                value={row.bank}
                onChange={(bank) => updateLoans(key, (rows) => rows.map((r) => (r.key === row.key ? { ...r, bank } : r)))}
              />
              {list.length > 1 ? (
                <Text variant="body-sm" weight={600} tone="primary-900" accessibilityRole="button" accessibilityLabel={t('assets.removeLender')} onPress={() => updateLoans(key, (rows) => rows.filter((r) => r.key !== row.key))}>✕</Text>
              ) : null}
            </View>
            {row.bank === OTHER_BANK ? (
              <TextField
                variant="form"
                outlined
                value={row.lender}
                onChangeText={(lender) => updateLoans(key, (rows) => rows.map((r) => (r.key === row.key ? { ...r, lender } : r)))}
                placeholder={t('entry.otherLenderName')}
                accessibilityLabel={t('entry.otherLenderName')}
                {...chain(`loanbank:${key}:${row.key}`)}
              />
            ) : null}
            <TextField
              variant="form"
              outlined
              value={row.amount}
              onChangeText={(value) => updateLoans(key, (rows) => rows.map((r) => (r.key === row.key ? { ...r, amount: formatAmountTyping(value, currency) } : r)))}
              keyboardType="decimal-pad"
              placeholder="0"
              right={<Text variant="body-sm" weight={500}>{currency}</Text>}
              {...chain(`loan:${key}:${row.key}`)}
            />
          </View>
        ))}
        <Text variant="body-sm" weight={500} tone="primary-900" style={{ textAlign: 'center' }} accessibilityRole="button" onPress={() => updateLoans(key, (rows) => [...rows, { key: (rows[rows.length - 1]?.key ?? 0) + 1, bank: null, lender: '', amount: '' }])}>
          {t('assets.addLender')}
        </Text>
      </View>
    );
  };

  const financialField = (field: { key: string; label: TKey }) => (
    <TextField
      key={field.key}
      variant="form"
      outlined
      label={t(field.label)}
      value={amounts[field.key] ?? ''}
      onChangeText={(value) => setAmount(field.key, value)}
      keyboardType="decimal-pad"
      placeholder="0"
      right={<Text variant="body-sm" weight={500}>{currency}</Text>}
      {...chain(`amt:${field.key}`)}
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
            {zeroHint}
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
        {zeroHint}
        {existing && <Text variant="caption" tone="neutral-600">{`${t('assets.endDate')}: ${end ? new Date(end).toLocaleDateString() : '—'}`}</Text>}
        <View style={panelStyle}>
        <Text variant="body-lg" weight={700} tone="primary-900">{t('assets.current')}</Text>
        <FieldLabel label={t('assets.cashBank')} variant="body" tone="primary-900" />
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
            <SelectField
              variant="chip"
              placeholder={t('assets.selectBank')}
              searchable
              options={[...bankOptions, { value: OTHER_BANK, label: t('entry.otherLender') }]}
              value={row.custom ? OTHER_BANK : row.bankName || null}
              onChange={(picked) => setRows((old) => old.map((r) => r.key === row.key ? (picked === OTHER_BANK ? { ...r, custom: true, bankName: '' } : { ...r, custom: false, bankName: picked }) : r))}
            />
            {row.custom ? (
              <TextField
                variant="form"
                outlined
                value={row.bankName}
                onChangeText={(bankName) => setRows((old) => old.map((r) => r.key === row.key ? { ...r, bankName } : r))}
                placeholder={t('entry.otherLenderName')}
                accessibilityLabel={t('entry.otherLenderName')}
                {...chain(`bank:${row.key}`)}
              />
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text variant="body" weight={600} tone="primary-900">{currency}</Text>
              <View style={{ flex: 1 }}>
                <TextField
                  variant="form"
                  outlined
                  value={row.amount}
                  onChangeText={(amount) => setRows((old) => old.map((r) => r.key === row.key ? { ...r, amount: formatAmountTyping(amount, r.currency) } : r))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  {...chain(`cash:${row.key}`)}
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
        {otherAssets.map((other) => (
          <View key={`other-${other.key}`} style={{ gap: 8 }}>
            <TextField
              variant="form"
              outlined
              label={t('assets.otherAssetName')}
              value={other.name}
              onChangeText={(name) => setOtherAssets((old) => old.map((o) => (o.key === other.key ? { ...o, name } : o)))}
              placeholder={t('assets.otherAssetPlaceholder')}
              {...chain(`othername:${other.key}`)}
              right={
                <Text variant="body-sm" weight={600} tone="primary-900" accessibilityRole="button" accessibilityLabel={t('assets.removeOther')} onPress={() => setOtherAssets((old) => old.filter((o) => o.key !== other.key))}>
                  ✕
                </Text>
              }
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text variant="body" weight={600} tone="primary-900">{currency}</Text>
              <View style={{ flex: 1 }}>
                <TextField
                  variant="form"
                  outlined
                  value={other.amount}
                  onChangeText={(value) => setOtherAssets((old) => old.map((o) => (o.key === other.key ? { ...o, amount: formatAmountTyping(value, currency) } : o)))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  {...chain(`other:${other.key}`)}
                />
              </View>
            </View>
          </View>
        ))}
        <Text variant="body-sm" weight={500} tone="primary-900" style={{ textAlign: 'center' }} accessibilityRole="button" onPress={() => setOtherAssets((old) => [...old, { key: (old[old.length - 1]?.key ?? 0) + 1, name: '', amount: '' }])}>
          {t('assets.addOtherAsset')}
        </Text>
        </View>
          </View>
        )}

        {currentSection === 'liabilities' && (
          <View style={{ gap: 16 }}>
            {zeroHint}
            <View style={panelStyle}>
            <Text variant="body-lg" weight={700} tone="primary-900">{t('assets.currentLiabilities')}</Text>
            {BALANCE_FIELDS.slice(0, 6).map((f) => (LOAN_KEYS.includes(f.key as LoanKey) ? loanField(f) : financialField(f)))}
            </View>
            <View style={panelStyle}>
            <Text variant="body-lg" weight={700} tone="primary-900">{t('assets.nonCurrentLiabilities')}</Text>
            {BALANCE_FIELDS.slice(6, 8).map((f) => (LOAN_KEYS.includes(f.key as LoanKey) ? loanField(f) : financialField(f)))}
            </View>
          </View>
        )}

        {currentSection === 'equity' && (
          <View style={{ gap: 16 }}>
            {zeroHint}
            <View style={panelStyle}>
            {BALANCE_FIELDS.slice(8).map(financialField)}
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
            // Back keeps its natural width so its label is never squeezed out; Next takes the rest.
            <View style={{ flexShrink: 0 }}>
              <Button variant="soft" label={t('common.back')} onPress={() => { setError(undefined); setSectionIndex((index) => index - 1); }} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Button
              variant="primary"
              className="w-full"
              label={sectionIndex === sections.length - 1 ? t('assets.finish') : t('common.next')}
              trailingIcon={sectionIndex === sections.length - 1 ? undefined : 'chevronRight'}
              loading={saving}
              onPress={continueSection}
            />
          </View>
        </View>
      </View>
    </OnboardingShell>
  );
}
