import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { Chip, ChipRow } from '@/components/Chip';
import { CurrencyInput } from '@/components/CurrencyInput';
import { DateInput } from '@/components/DateInput';
import { GroupCard } from '@/components/GroupCard';
import { Icon } from '@/components/Icon';
import { ImpactStrip } from '@/components/ImpactStrip';
import { InfoCard } from '@/components/InfoCard';
import { ScreenShell } from '@/components/ScreenShell';
import { SegmentedControl } from '@/components/SegmentedControl';
import { SelectField } from '@/components/SelectField';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n, type TKey } from '@/i18n';
import { colors } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';
import { previewAccountingImpact } from '@/services/analysis';
import type { AccountingImpact } from '@/services/sync';
import {
  addTransaction,
  formatMoney,
  formatMoneyWhole,
  getAccountBalances,
  getEntryType,
  getEntryTypes,
  getSettings,
  groupsFor,
  GROUPS,
  listBanks,
  listCategories,
  parseAmountInput,
  validateTransaction,
  type AddTransactionInput,
  type Currency,
  type Direction,
  type ValidationErrors,
} from '@/services/bookkeeping';

type Pay = 'cash' | 'bank' | 'later';

/** Add an entry — Money in | Money out | Move money (FINEXT_APP_MODULES §3.8). Writes to the local DB only; works offline. */
export default function AddEntry() {
  const router = useRouter();
  const { t } = useI18n();
  const dark = useAppTheme();
  const { data: settings } = useLocalQuery(getSettings, []);
  const { data: banks } = useLocalQuery(listBanks, []);
  const { data: categories } = useLocalQuery(() => listCategories(), []);
  const { data: balances } = useLocalQuery(getAccountBalances, []);

  const [direction, setDirection] = useState<Direction>('in');
  const [typeId, setTypeId] = useState<string | null>(null);
  const [dateMs, setDateMs] = useState<number | null>(Date.now());
  const [amountText, setAmountText] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [pay, setPay] = useState<Pay>('cash');
  const [bankId, setBankId] = useState<string | null>(null);
  const [toBankId, setToBankId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [party, setParty] = useState('');
  const [note, setNote] = useState('');
  const [costText, setCostText] = useState('');
  const [lender, setLender] = useState('');
  const [lenderType, setLenderType] = useState<'bank_mfi' | 'informal'>('bank_mfi');
  const [longTerm, setLongTerm] = useState(false);
  const [installmentText, setInstallmentText] = useState('');
  const [repaymentFrequency, setRepaymentFrequency] = useState<'weekly' | 'monthly'>('monthly');
  const [assetName, setAssetName] = useState('');
  const [usefulLife, setUsefulLife] = useState('');
  const [loanName, setLoanName] = useState('');
  const [interestText, setInterestText] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [impact, setImpact] = useState<AccountingImpact | null>(null);

  const type = typeId ? getEntryType(typeId) : undefined;
  const cashBank = banks?.find((b) => b.kind === 'cash');
  const nonCash = useMemo(() => (banks ?? []).filter((b) => b.kind !== 'cash'), [banks]);
  const rate = settings?.rateKhrPerUsd ?? 4000;
  const amount = parseAmountInput(amountText, currency);
  const interest = parseAmountInput(interestText, currency);

  useEffect(() => {
    if (settings) setCurrency(settings.displayCurrency);
  }, [settings?.displayCurrency]); // eslint-disable-line react-hooks/exhaustive-deps

  // sensible account defaults once banks load
  useEffect(() => {
    if (!banks) return;
    if (pay === 'cash') setBankId(cashBank?.id ?? null);
    else if (pay === 'bank') setBankId((cur) => (nonCash.some((b) => b.id === cur) ? cur : (nonCash[0]?.id ?? null)));
  }, [pay, banks]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeDirection = (d: Direction) => {
    setDirection(d);
    setTypeId(d === 'move' ? 'transfer' : null);
    setAttempted(false);
    setPay('cash');
    setBankId(cashBank?.id ?? null); // never carry an account picked for a move into a cash entry
    if (d === 'move') setToBankId(nonCash[0]?.id ?? null);
  };

  const chooseType = (id: string) => {
    setTypeId(id);
    if (!getEntryType(id)?.allowsPayLater && pay === 'later') setPay('cash');
    setAttempted(false);
  };

  // The entry exactly as it would be saved; used for the live preview, validation and saving.
  const input: AddTransactionInput | null = type
    ? {
        typeId: type.id,
        amount,
        currency,
        payMethod: type.direction === 'move' ? 'bank' : pay,
        bankId,
        toBankId: type.direction === 'move' ? toBankId : null,
        categoryId,
        title: t(`type.${type.id}` as TKey),
        counterparty: party || lender,
        note,
        occurredAt: dateMs ?? undefined, // addTransaction uses "now" when no date is picked
        meta: {
          cost: costText ? parseAmountInput(costText, currency) : undefined,
          lender: lender || undefined,
          lenderType: type.extraFields.includes('lenderType') ? lenderType : undefined,
          termMonths: type.extraFields.includes('term') ? (longTerm ? 24 : 12) : undefined,
          installmentAmount: installmentText ? parseAmountInput(installmentText, currency) : undefined,
          repaymentFrequency: installmentText ? repaymentFrequency : undefined,
          assetName: assetName || undefined,
          usefulLifeYears: usefulLife ? Number(usefulLife) : undefined,
          loanName: loanName || undefined,
          interest: type.extraFields.includes('interestPart') ? interest : undefined,
        },
      }
    : null;

  // Errors appear after the first Save attempt, then update as the user types, so a fixed
  // field stops showing its error straight away instead of waiting for the next Save.
  const errors: ValidationErrors & { type?: string } = !attempted ? {} : input ? validateTransaction(input) : { type: 'error.chooseType' };
  const err = (k: keyof ValidationErrors) => (errors[k] ? t(errors[k] as TKey) : undefined);

  const accountOptions = (banks ?? []).map((b) => ({ value: b.id, label: b.name }));

  // Only preview a complete entry: e.g. "Pay later" before the customer is typed would be rejected by the server.
  const previewReady = input !== null && amount > 0 && Object.keys(validateTransaction(input)).length === 0;
  const previewKey = previewReady ? JSON.stringify({ ...input, title: undefined, note: undefined, categoryId: undefined, occurredAt: undefined }) : null;
  useEffect(() => {
    if (!previewKey) {
      const reset = setTimeout(() => setImpact(null), 0);
      return () => clearTimeout(reset);
    }
    let active = true;
    const timer = setTimeout(() => {
      previewAccountingImpact(JSON.parse(previewKey))
        .then((result) => { if (active) setImpact(result); })
        .catch(() => { if (active) setImpact(null); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [previewKey]);

  const save = async () => {
    setAttempted(true);
    if (!input || Object.keys(validateTransaction(input)).length > 0) return;
    setSaving(true);
    const result = await addTransaction(input);
    setSaving(false);
    if (result.ok) router.replace('/bookkeeping');
  };

  // ------------------------------------------------------------------ pieces

  const impactStrip = impact ? (
    <ImpactStrip
      tone={impact.tone}
      sentence={t(`impact.${impact.kind}` as TKey, { amount: formatMoneyWhole(Math.abs(amount - interest), currency) })}
      effect={t(`impact.${impact.kind}.effect` as TKey, { amount: formatMoneyWhole(impact.value, currency, { showPlus: impact.value > 0 }) })}
    />
  ) : null;

  const typeChips = (groupId: keyof typeof GROUPS) => (
    <GroupCard key={groupId} title={t(GROUPS[groupId].labelKey as TKey)} subtitle={GROUPS[groupId].subKey ? t(GROUPS[groupId].subKey as TKey) : undefined}>
      {getEntryTypes(direction)
        .filter((e) => e.groupId === groupId)
        .map((e) => (
          <Chip key={e.id} label={t(`type.${e.id}` as TKey)} selected={typeId === e.id} onPress={() => chooseType(e.id)} />
        ))}
    </GroupCard>
  );

  const step1 =
    direction === 'move' ? null : type ? (
      <View className="flex-row items-center justify-between bg-primary-50 rounded-lg" style={{ paddingHorizontal: 14, paddingVertical: 8, backgroundColor: dark ? colors.dark.surface : undefined }}>
        <View className="flex-1">
          <Text variant="micro" weight={300} tone="neutral-600">
            {t('entry.step1Short')}
          </Text>
          <Text variant="body" weight={600} tone="primary-900" style={{ fontSize: 14 }}>
            {t(`type.${type.id}` as TKey)}
          </Text>
          <Text variant="micro" weight={300} tone="neutral-600">
            {t(GROUPS[type.groupId as keyof typeof GROUPS].labelKey as TKey)}
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => setTypeId(null)} className="flex-row items-center" style={{ gap: 4, minHeight: 44 }}>
          <Text variant="caption" weight={500} tone="primary-500">
            {t('entry.change')}
          </Text>
          <Icon name="chevronDown" size={14} color={colors.primary[500]} />
        </Pressable>
      </View>
    ) : (
      <View style={{ gap: 12 }}>
        <Text variant="body" weight={500} tone="primary-900">
          {t('entry.step1')}
        </Text>
        {groupsFor(direction).map((g) => typeChips(g as keyof typeof GROUPS))}
        {errors.type ? (
          <Text variant="caption" tone="danger">
            {t('error.chooseType')}
          </Text>
        ) : null}
      </View>
    );

  const payRow = type && direction !== 'move' && (
    <View style={{ gap: 8 }}>
      <Text variant="body" weight={500} tone="primary-900" style={{ fontSize: 14 }}>
        {direction === 'in' ? t('entry.step3In') : t('entry.step3Out')}
      </Text>
      <ChipRow>
        <Chip label={t('entry.cash')} selected={pay === 'cash'} onPress={() => setPay('cash')} />
        <Chip label={t('entry.bank')} selected={pay === 'bank'} onPress={() => setPay('bank')} />
        {type.allowsPayLater && <Chip label={t('entry.payLater')} selected={pay === 'later'} onPress={() => setPay('later')} />}
      </ChipRow>
      {!type.allowsPayLater && <InfoCard>{t('entry.noPayLater')}</InfoCard>}
      {pay === 'bank' && <SelectField label={t('entry.account')} options={accountOptions.filter((o) => nonCash.some((b) => b.id === o.value))} value={bankId} onChange={setBankId} error={err('bank')} />}
      {pay === 'later' && (
        <View style={{ gap: 8 }}>
          <TextField label={type.party === 'supplier' ? t('entry.supplier') : t('entry.customer')} value={party} onChangeText={setParty} error={err('counterparty')} />
          <Text variant="micro" weight={300} tone="neutral-600">
            {direction === 'in' ? t('entry.laterHintIn') : t('entry.laterHintOut')}
          </Text>
        </View>
      )}
    </View>
  );

  const extras = type && (
    <View style={{ gap: 12 }}>
      {type.extraFields.includes('customerRequired') && <TextField label={t('entry.customer')} value={party} onChangeText={setParty} error={err('counterparty')} />}
      {type.extraFields.includes('cost') && (
        <View style={{ gap: 4 }}>
          <TextField label={t('entry.cost')} value={costText} onChangeText={(v) => setCostText(v.replace(/[^0-9.,]/g, ''))} keyboardType="decimal-pad" placeholder={t('entry.costHint')} />
          <Text variant="micro" weight={300} tone="neutral-600">{t('entry.costHelp')}</Text>
        </View>
      )}
      {type.extraFields.includes('lender') && <TextField label={t('entry.lender')} value={lender} onChangeText={setLender} error={err('lender')} />}
      {type.extraFields.includes('lenderType') && (
        <View style={{ gap: 6 }}>
          <Text variant="body" weight={500} tone="primary-900" style={{ fontSize: 14 }}>
            {t('entry.lenderType')}
          </Text>
          <ChipRow>
            <Chip label={t('entry.bankMfi')} selected={lenderType === 'bank_mfi'} onPress={() => setLenderType('bank_mfi')} />
            <Chip label={t('entry.informal')} selected={lenderType === 'informal'} onPress={() => setLenderType('informal')} />
          </ChipRow>
        </View>
      )}
      {type.extraFields.includes('term') && (
        <View style={{ gap: 6 }}>
          <Text variant="body" weight={500} tone="primary-900" style={{ fontSize: 14 }}>
            {t('entry.term')}
          </Text>
          <ChipRow>
            <Chip label={t('entry.upTo12')} selected={!longTerm} onPress={() => setLongTerm(false)} />
            <Chip label={t('entry.longer12')} selected={longTerm} onPress={() => setLongTerm(true)} />
          </ChipRow>
        </View>
      )}
      {type.extraFields.includes('repaymentSchedule') && (
        <View style={{ gap: 6 }}>
          <TextField label={t('entry.installmentAmount')} value={installmentText} onChangeText={(v) => setInstallmentText(v.replace(/[^0-9.,]/g, ''))} keyboardType="decimal-pad" />
          <Text variant="micro" weight={300} tone="neutral-600">{t('entry.repaymentFrequency')}</Text>
          <ChipRow>
            <Chip label={t('entry.frequencyMonthly')} selected={repaymentFrequency === 'monthly'} onPress={() => setRepaymentFrequency('monthly')} />
            <Chip label={t('entry.frequencyWeekly')} selected={repaymentFrequency === 'weekly'} onPress={() => setRepaymentFrequency('weekly')} />
          </ChipRow>
        </View>
      )}
      {type.extraFields.includes('assetName') && <TextField label={t('entry.assetName')} value={assetName} onChangeText={setAssetName} error={err('assetName')} />}
      {type.extraFields.includes('usefulLife') && <TextField label={t('entry.usefulLife')} value={usefulLife} onChangeText={(v) => setUsefulLife(v.replace(/\D/g, ''))} keyboardType="number-pad" error={err('usefulLife')} />}
      {type.extraFields.includes('loanName') && <TextField label={t('entry.whichLoan')} value={loanName} onChangeText={setLoanName} />}
      {type.extraFields.includes('interestPart') && <TextField label={t('entry.interestPart')} value={interestText} onChangeText={(v) => setInterestText(v.replace(/[^0-9.,]/g, ''))} keyboardType="decimal-pad" error={err('interest')} />}
    </View>
  );

  // Move money: from / to accounts + "after this move" preview
  const bal = (id: string | null) => balances?.find((b) => b.bankId === id)?.byCurrency[currency] ?? 0;
  const movePreview =
    direction === 'move' && bankId && toBankId && amount > 0 ? (
      <View className="bg-primary-50 rounded-lg" style={{ padding: 12, gap: 6, backgroundColor: dark ? colors.dark.surface : undefined }}>
        <Text variant="caption" weight={600} tone="primary-900">
          {t('entry.afterMove')}
        </Text>
        {[bankId, toBankId].map((id, i) => (
          <View key={id} className="flex-row justify-between">
            <Text variant="caption" weight={400} tone="primary-900">
              {banks?.find((b) => b.id === id)?.name}
            </Text>
            <Text variant="caption" weight={400} tone="primary-900">
              {formatMoney(bal(id), currency)} → {formatMoney(bal(id) + (i === 0 ? -amount : amount), currency)}
            </Text>
          </View>
        ))}
      </View>
    ) : null;

  const moveFields = direction === 'move' && (
    <View style={{ gap: 12 }}>
      <SelectField label={t('entry.moveFrom')} options={accountOptions} value={bankId} onChange={setBankId} error={err('bank')} />
      <SelectField label={t('entry.moveTo')} options={accountOptions} value={toBankId} onChange={setToBankId} error={err('toBank')} />
    </View>
  );

  const hero = (
    <View className="px-6" style={{ paddingTop: 4, paddingBottom: 16 }}>
      <SegmentedControl
        variant="tab"
        options={[
          { value: 'in', label: t('entry.moneyIn') },
          { value: 'out', label: t('entry.moneyOut') },
          { value: 'move', label: t('entry.moveMoney') },
        ]}
        value={direction}
        onChange={changeDirection}
      />
    </View>
  );

  const noteRequired = type?.extraFields.includes('noteRequired');

  return (
    <ScreenShell
      title={t('screen.addEntry')}
      nav="bookkeeping"
      hero={hero}
      padding={24}
      footer={
        <View>
          {impactStrip}
          <Button label={t('entry.save')} onPress={save} loading={saving} />
        </View>
      }
    >
      <View style={{ gap: 16 }}>
        <View style={{ alignItems: 'flex-start' }}>
          <View style={{ alignSelf: 'stretch' }}>
            <DateInput variant="entry" label={t('entry.when')} value={dateMs} onChange={setDateMs} error={err('date')} />
          </View>
        </View>
        {step1}
        {direction === 'move' ? moveFields : null}
        {(type || direction === 'move') && (
          <CurrencyInput
            label={direction === 'move' ? t('entry.step3Move') : t('entry.step2')}
            text={amountText}
            currency={currency}
            onChangeText={setAmountText}
            onChangeCurrency={(c) => {
              setCurrency(c);
              setAmountText('');
              setCostText('');
              setInterestText('');
            }}
            rate={rate}
            error={err('amount')}
          />
        )}
        {movePreview}
        {payRow}
        {extras}
        {/* A required note is part of the main form; otherwise category and note are optional extras. */}
        {noteRequired && <TextField label={t('entry.noteRequired')} value={note} onChangeText={setNote} multiline error={err('note')} />}
        {type && (detailsOpen || categoryId || (!noteRequired && note) ? (
          <View style={{ gap: 12 }}>
            {direction !== 'move' && (
              <SelectField
                label={t('entry.category')}
                placeholder={t('entry.categoryNone')}
                options={(categories ?? []).filter((c) => (direction === 'in' ? c.kind === 'income' : c.kind === 'expense')).map((c) => ({ value: c.id, label: c.name }))}
                value={categoryId}
                onChange={setCategoryId}
              />
            )}
            {!noteRequired && <TextField label={t('entry.note')} value={note} onChangeText={setNote} multiline />}
          </View>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setDetailsOpen(true)} className="flex-row items-center" style={{ gap: 6, minHeight: 44 }}>
            <Icon name="plus" size={16} color={colors.primary[500]} />
            <Text variant="caption" weight={600} tone="primary-500">
              {t(direction === 'move' ? 'entry.addNote' : 'entry.addDetails')}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScreenShell>
  );
}
