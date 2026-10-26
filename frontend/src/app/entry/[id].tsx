import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { Chip, ChipRow } from '@/components/Chip';
import { ScreenShell } from '@/components/ScreenShell';
import { SelectField } from '@/components/SelectField';
import { EmptyState, LoadingState } from '@/components/StateViews';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { TransactionRow } from '@/components/TransactionRow';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n, type TKey } from '@/i18n';
import { confirmAction } from '@/lib/confirm';
import { formatTxDate } from '@/lib/format';
import {
  formatAmountTyping,
  formatMoney,
  getEntryDetail,
  listBanks,
  parseAmountInput,
  recordPayment,
  reverseEntry,
  type EntryDetail,
  type ValidationErrors,
} from '@/services/bookkeeping';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between" style={{ gap: 12, paddingVertical: 4 }}>
      <Text variant="caption" tone="neutral-600">{label}</Text>
      <Text variant="caption" weight={600} tone="primary-900" style={{ flex: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

/** Mark as paid: full or part of what is still owed, into or out of a chosen account. */
function PaymentForm({ detail, onDone }: { detail: EntryDetail; onDone: () => void }) {
  const { t } = useI18n();
  const { data: banks } = useLocalQuery(listBanks, []);
  const { entry } = detail;
  const owed = entry.openBalance ?? 0;
  const incoming = entry.direction === 'in';
  const toText = (minor: number) => (entry.currency === 'USD' ? (minor / 100).toFixed(2) : String(minor));
  const [amountText, setAmountText] = useState(toText(owed));
  const [method, setMethod] = useState<'cash' | 'bank'>('cash');
  const [bankId, setBankId] = useState<string | null>(null);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [saving, setSaving] = useState(false);
  const accounts = (banks ?? []).filter((b) => (method === 'cash' ? b.kind === 'cash' : b.kind !== 'cash'));
  const account = accounts.find((b) => b.id === bankId) ?? (method === 'cash' ? accounts[0] : undefined);
  const amount = parseAmountInput(amountText, entry.currency);
  const err = (key: keyof ValidationErrors) => (errors[key] ? t(errors[key] as TKey) : undefined);

  const save = async () => {
    setSaving(true);
    const name = entry.counterparty ?? '';
    const result = await recordPayment({
      entryId: entry.id,
      amount,
      payMethod: method,
      bankId: account?.id ?? null,
      title: name ? t(incoming ? 'entry.paymentTitleIn' : 'entry.paymentTitleOut', { name }) : t(`type.${incoming ? 'customer_payment' : 'supplier_payment'}` as TKey),
    });
    setSaving(false);
    if (result.ok) onDone();
    else setErrors(result.errors);
  };

  return (
    <View style={{ gap: 12 }}>
      <TextField
        label={t(incoming ? 'entry.amountReceived' : 'entry.amountPaid')}
        value={amountText}
        onChangeText={(v) => setAmountText(formatAmountTyping(v, entry.currency))}
        keyboardType="decimal-pad"
        error={err('amount')}
        right={<Text variant="body-sm" weight={500}>{entry.currency}</Text>}
      />
      {amount !== owed && (
        <Pressable accessibilityRole="button" onPress={() => setAmountText(toText(owed))} style={{ alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' }}>
          <Text variant="caption" weight={600} tone="primary-500">{t('entry.payFull', { amount: formatMoney(owed, entry.currency) })}</Text>
        </Pressable>
      )}
      <View style={{ gap: 6 }}>
        <Text variant="caption" weight={600} tone="primary-900">{t(incoming ? 'entry.receivedInto' : 'entry.paidFrom')}</Text>
        <ChipRow>
          <Chip label={t('entry.cash')} selected={method === 'cash'} onPress={() => { setMethod('cash'); setBankId(null); }} />
          <Chip label={t('entry.bank')} selected={method === 'bank'} onPress={() => { setMethod('bank'); setBankId(null); }} />
        </ChipRow>
        {method === 'bank' && (
          <SelectField label={t('entry.account')} options={accounts.map((b) => ({ value: b.id, label: b.name }))} value={account?.id ?? null} onChange={setBankId} error={err('bank')} />
        )}
      </View>
      <Button size="sm" label={t('entry.savePayment')} onPress={save} loading={saving} />
    </View>
  );
}

/** One entry: details, payment status for pay-later entries, and Reverse (spec: Actions). */
export default function EntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, locale } = useI18n();
  const dark = useAppTheme();
  const { data: detail, loading } = useLocalQuery(() => getEntryDetail(String(id)), [id]);
  const [paying, setPaying] = useState(false);
  const [reverseError, setReverseError] = useState<string | null>(null);
  const card = { padding: 16, borderRadius: radius.card, gap: 8, backgroundColor: dark ? colors.dark.surface : colors.white, borderWidth: 1, borderColor: dark ? colors.dark.border : colors.neutral[200] } as const;

  if (loading && !detail) return <ScreenShell title={t('entry.detailTitle')} nav="bookkeeping"><LoadingState /></ScreenShell>;
  if (!detail) return <ScreenShell title={t('entry.detailTitle')} nav="bookkeeping"><EmptyState titleKey="entry.notFound" /></ScreenShell>;

  const { entry, payments, reversal, linked } = detail;
  const reversed = entry.status === 'reversed';
  const party = entry.direction === 'in' ? t('entry.customerLabel') : t('entry.supplierLabel');
  const amountText = entry.direction === 'move' ? formatMoney(entry.amount, entry.currency) : formatMoney(entry.signed, entry.currency);
  const paid = entry.openBalance === null ? 0 : entry.amount - entry.openBalance;

  const reverse = () => confirmAction(t('entry.reverseConfirmTitle'), t('entry.reverseConfirmBody'), t('entry.reverse'), t('common.cancel'), async () => {
    const result = await reverseEntry(entry.id, t('entry.reverseTitle', { title: entry.title }));
    if (!result.ok) setReverseError(t(result.error as TKey));
  });

  return (
    <ScreenShell title={t('entry.detailTitle')} nav="bookkeeping" padding={24}>
      <View style={{ gap: 16 }}>
        <View style={card}>
          <Text variant="micro" tone="neutral-600">{t(`type.${entry.typeId}` as TKey)}</Text>
          <Text variant="body-lg" weight={700} tone="primary-900">{entry.title}</Text>
          <Text
            variant="amount-xl"
            tone={reversed ? 'neutral-500' : entry.direction === 'out' ? 'expense' : 'primary-900'}
            style={reversed ? { textDecorationLine: 'line-through' } : undefined}
          >
            {amountText}
          </Text>
          <View style={{ marginTop: 4 }}>
            <DetailRow label={t('entry.dateLabel')} value={formatTxDate(entry.occurredAt, locale)} />
            <DetailRow label={t('entry.paidWith')} value={entry.payMethod === 'later' ? t('entry.payLater') : entry.bankName ?? '—'} />
            {entry.counterparty ? <DetailRow label={party} value={entry.counterparty} /> : null}
            {entry.note ? <DetailRow label={t('entry.noteLabel')} value={entry.note} /> : null}
          </View>
          {entry.syncStatus === 'pending' && <Text variant="micro" tone="neutral-500">{t('entry.notSynced')}</Text>}
        </View>

        {linked && (
          <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/entry/[id]', params: { id: linked.id } })} style={[card, { backgroundColor: dark ? colors.dark.surface : colors.primary[50], borderColor: 'transparent' }]}>
            <Text variant="caption" tone="primary-900">
              {t(entry.status === 'reversal' ? 'entry.reverses' : 'entry.paymentFor', { title: linked.title })} ›
            </Text>
          </Pressable>
        )}

        {reversal && (
          <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/entry/[id]', params: { id: reversal.id } })} style={[card, { backgroundColor: `${colors.neutral[500]}1A`, borderColor: 'transparent' }]}>
            <Text variant="caption" tone="primary-900">{t('entry.reversedOn', { date: formatTxDate(reversal.occurredAt, locale) })} ›</Text>
          </Pressable>
        )}

        {entry.openBalance !== null && (
          <View style={card}>
            <View className="flex-row items-center justify-between">
              <Text variant="body" weight={700} tone="primary-900">{t('entry.paymentStatus')}</Text>
              <Text variant="caption" weight={600} style={{ color: entry.openBalance === 0 ? colors.success : colors.alert }}>
                {entry.openBalance === 0 ? t('entry.fullyPaid') : t('entry.stillOwed', { amount: formatMoney(entry.openBalance, entry.currency) })}
              </Text>
            </View>
            <View style={{ height: 7, borderRadius: 99, backgroundColor: dark ? colors.dark.field : colors.neutral[200], overflow: 'hidden' }}>
              <View style={{ width: `${(paid / entry.amount) * 100}%`, height: '100%', backgroundColor: colors.success }} />
            </View>
            <Text variant="micro" tone="neutral-600">{t('entry.paidOf', { paid: formatMoney(paid, entry.currency), total: formatMoney(entry.amount, entry.currency) })}</Text>
            {payments.length > 0 && (
              <View>
                <Text variant="caption" weight={600} tone="primary-900" style={{ marginTop: 6 }}>{t('entry.payments')}</Text>
                {payments.map((p, i) => <TransactionRow key={p.id} tx={p} index={i} />)}
              </View>
            )}
            {entry.openBalance > 0 && (paying ? (
              <PaymentForm detail={detail} onDone={() => setPaying(false)} />
            ) : (
              <Button size="sm" icon="check" label={t('entry.markPaid')} onPress={() => setPaying(true)} />
            ))}
          </View>
        )}

        {!reversed && entry.status !== 'reversal' && (
          <View style={{ gap: 8 }}>
            {detail.reverseBlocked === 'entry.reverseBlockedPayments' ? (
              <Text variant="micro" tone="neutral-600">{t('entry.reverseBlockedPayments')}</Text>
            ) : (
              <>
                <Button size="sm" variant="soft" label={t('entry.reverse')} onPress={reverse} />
                <Text variant="micro" tone="neutral-600">{t('entry.reverseHint')}</Text>
              </>
            )}
            {reverseError ? <Text variant="micro" tone="danger">{reverseError}</Text> : null}
          </View>
        )}
      </View>
    </ScreenShell>
  );
}
