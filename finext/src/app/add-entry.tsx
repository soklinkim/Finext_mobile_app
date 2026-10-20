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
  previewImpact,
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
  const [assetName, setAssetName] = useState('');
  const [usefulLife, setUsefulLife] = useState('');
  const [loanName, setLoanName] = useState('');
  const [interestText, setInterestText] = useState('');
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [saving, setSaving] = useState(false);

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
    setErrors({});
    setPay('cash');
    setBankId(cashBank?.id ?? null); // never carry an account picked for a move into a cash entry
    if (d === 'move') setToBankId(nonCash[0]?.id ?? null);
  };

  const chooseType = (id: string) => {
    setTypeId(id);
    if (!getEntryType(id)?.allowsPayLater && pay === 'later') setPay('cash');
    setErrors({});
  };

  const err = (k: keyof ValidationErrors) => (errors[k] ? t(errors[k] as TKey) : undefined);

  const impact = type && amount > 0 ? previewImpact(type.id, amount, currency, interest) : null;
  const accountOptions = (banks ?? []).map((b) => ({ value: b.id, label: b.name }));

  const save = async () => {
    if (!type) {
      setErrors({ amount: 'error.chooseType' });
      return;
    }
    const input: AddTransactionInput = {
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
      occurredAt: dateMs ?? Date.now(),
      meta: {
        cost: costText ? parseAmountInput(costText, currency) : undefined,
        lender: lender || undefined,
        lenderType: type.extraFields.includes('lenderType') ? lenderType : undefined,
        termMonths: type.extraFields.includes('term') ? (longTerm ? 24 : 12) : undefined,
        assetName: assetName || undefined,
        usefulLifeYears: usefulLife ? Number(usefulLife) : undefined,
        loanName: loanName || undefined,
        interest: type.extraFields.includes('interestPart') ? interest : undefined,
      },
    };
    setSaving(true);
    const result = await addTransaction(input);
    setSaving(false);
    if (result.ok) router.replace('/bookkeeping');
    else setErrors(result.errors);
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
      <View className="flex-row items-center justify-between bg-primary-50 rounded-lg" style={{ paddingHorizontal: 14, paddingVertical: 8 }}>
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
        {errors.amount === 'error.chooseType' ? (
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
      {type.extraFields.includes('cost') && <TextField label={t('entry.cost')} value={costText} onChangeText={(v) => setCostText(v.replace(/[^0-9.,]/g, ''))} keyboardType="decimal-pad" placeholder={t('entry.costHint')} />}
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
      <View className="bg-primary-50 rounded-lg" style={{ padding: 12, gap: 6 }}>
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
            <DateInput variant="entry" value={dateMs} onChange={setDateMs} error={err('date')} />
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
        {type && direction !== 'move' && (
          <SelectField
            label={t('entry.category')}
            placeholder={t('entry.categoryNone')}
            options={(categories ?? []).filter((c) => (direction === 'in' ? c.kind === 'income' : c.kind === 'expense')).map((c) => ({ value: c.id, label: c.name }))}
            value={categoryId}
            onChange={setCategoryId}
          />
        )}
        {(type || direction === 'move') && (
          <TextField label={noteRequired ? t('entry.noteRequired') : t('entry.note')} value={note} onChangeText={setNote} multiline error={err('note')} />
        )}
      </View>
    </ScreenShell>
  );
}
