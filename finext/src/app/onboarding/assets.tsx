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
import {
  completeOnboarding,
  formatAmountTyping,
  getSettings,
  listBanks,
  parseAmountInput,
  type Currency,
  type OnboardingAsset,
} from '@/services/bookkeeping';

interface BankRow {
  key: number;
  bankName: string;
  khr: string;
  usd: string;
}

const OTHER_ASSETS: { kind: OnboardingAsset['kind']; label: TKey }[] = [
  { kind: 'receivable', label: 'assets.receivable' },
  { kind: 'inventory', label: 'assets.inventory' },
  { kind: 'prepaid', label: 'assets.prepaid' },
];

/** "1. Enter Business Assets" — current assets: cash & bank balances (KHR + USD rows per bank), receivables, inventory, prepaid. */
export default function Assets() {
  const router = useRouter();
  const { t } = useI18n();
  const { data: settings } = useLocalQuery(getSettings, []);
  const { data: banks } = useLocalQuery(listBanks, []);
  const existing = settings?.startOption === 'existing';

  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [rows, setRows] = useState<BankRow[]>([{ key: 1, bankName: '', khr: '', usd: '' }]);
  const [other, setOther] = useState<Record<string, { khr: string; usd: string }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const bankOptions = (banks ?? []).map((b) => ({ value: b.name, label: b.name }));
  const patchRow = (key: number, p: Partial<BankRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const setOtherField = (kind: string, cur: 'khr' | 'usd', v: string) =>
    setOther((o) => ({ ...o, [kind]: { khr: o[kind]?.khr ?? '', usd: o[kind]?.usd ?? '', [cur]: formatAmountTyping(v, cur === 'khr' ? 'KHR' : 'USD') } }));

  // existing-balance start: the period must be at least one month (FINEXT_APP_MODULES §3.2)
  const dateError = existing && start && end && end < start + 28 * 24 * 3600 * 1000 ? t('error.periodShort') : undefined;

  const finish = async () => {
    if (existing && (!start || !end)) return setError(t('error.required'));
    if (dateError) return;
    setSaving(true);
    const assets: OnboardingAsset[] = [];
    const push = (kind: OnboardingAsset['kind'], name: string, text: string, currency: Currency, bankName?: string) => {
      const amount = parseAmountInput(text, currency);
      if (amount > 0) assets.push({ kind, name, bankName, amount, currency });
    };
    for (const r of rows) {
      const name = r.bankName.trim() || t('assets.cash');
      push('cash_bank', name, r.khr, 'KHR', name);
      push('cash_bank', name, r.usd, 'USD', name);
    }
    for (const o of OTHER_ASSETS) {
      push(o.kind, t(o.label), other[o.kind]?.khr ?? '', 'KHR');
      push(o.kind, t(o.label), other[o.kind]?.usd ?? '', 'USD');
    }
    // the business profile was already saved on the previous step
    await completeOnboarding({ startOption: settings?.startOption ?? 'new', profile: {}, assets, asOf: start ?? undefined });
    router.replace('/home');
  };

  const amountRow = (label: TKey | null, khr: string, usd: string, onKhr: (v: string) => void, onUsd: (v: string) => void) => (
    <View style={{ gap: 12 }}>
      {label ? (
        <Text variant="body" tone="primary-900">
          {t(label)}
        </Text>
      ) : null}
      <TextField variant="form" value={khr} onChangeText={onKhr} keyboardType="number-pad" placeholder="5,000,000 ៛" accessibilityLabel={`${label ? t(label) : ''} KHR`} right={<Text variant="body" weight={500}>KHR</Text>} />
      <TextField variant="form" value={usd} onChangeText={onUsd} keyboardType="decimal-pad" placeholder="$5,000" accessibilityLabel={`${label ? t(label) : ''} USD`} right={<Text variant="body" weight={500}>USD</Text>} />
    </View>
  );

  return (
    <OnboardingShell title={t('onb.enterAssets')} step={4} form>
      <View style={{ gap: 20 }}>
        {existing && (
          <>
            <DateInput label={t('assets.startDate')} value={start} onChange={setStart} error={error && !start ? error : undefined} />
            <DateInput label={t('assets.endDate')} value={end} onChange={setEnd} error={dateError ?? (error && !end ? error : undefined)} />
          </>
        )}
        <Text variant="body-sm" weight={600} tone="primary-900" style={{ textAlign: 'center' }}>
          {t('assets.current')}
        </Text>
        <Text variant="body" tone="primary-900">
          {t('assets.cashBank')}
        </Text>
        {rows.map((r) => (
          <View key={r.key} style={{ gap: 12 }}>
            <SelectField variant="chip" placeholder={t('assets.selectBank')} options={bankOptions} value={r.bankName || null} onChange={(v) => patchRow(r.key, { bankName: v })} />
            {amountRow(null, r.khr, r.usd, (v) => patchRow(r.key, { khr: formatAmountTyping(v, 'KHR') }), (v) => patchRow(r.key, { usd: formatAmountTyping(v, 'USD') }))}
          </View>
        ))}
        <Text variant="body-sm" weight={500} style={{ textAlign: 'center' }} onPress={() => setRows((rs) => [...rs, { key: rs.length + 1, bankName: '', khr: '', usd: '' }])} accessibilityRole="button">
          {t('assets.addBank')}
        </Text>
        {OTHER_ASSETS.map((o) => (
          <View key={o.kind}>{amountRow(o.label, other[o.kind]?.khr ?? '', other[o.kind]?.usd ?? '', (v) => setOtherField(o.kind, 'khr', v), (v) => setOtherField(o.kind, 'usd', v))}</View>
        ))}
        <View className="items-center">
          <Button variant="text" label={t('common.next')} loading={saving} onPress={finish} />
        </View>
      </View>
    </OnboardingShell>
  );
}
