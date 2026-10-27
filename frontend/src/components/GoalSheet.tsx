import { useState } from 'react';
import { View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Chip, ChipRow } from './Chip';
import { Text } from './Text';
import { TextField } from './TextField';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n } from '@/i18n';
import { confirmAction } from '@/lib/confirm';
import {
  addToSavings,
  amountToInput,
  deleteCategory,
  formatMoneyWhole,
  listBanks,
  parseAmountInput,
  renameCategory,
  setGoalTarget,
  type SavingsGoal,
} from '@/services/bookkeeping';
import { colors } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

/**
 * A savings goal: progress against its target, set the target, and put money aside. Putting money aside is a transfer
 * into the Savings account tagged with the goal, so it is not an expense and profit does not change.
 */
export function GoalSheet({ goal, onClose }: { goal: SavingsGoal | null; onClose: () => void }) {
  const { t } = useI18n();
  const dark = useAppTheme();
  const { data: banks } = useLocalQuery(listBanks, []);
  const accounts = (banks ?? []).filter((b) => b.logoKey !== 'savings');
  const [target, setTarget] = useState('');
  const [editingTarget, setEditingTarget] = useState(false);
  const [amount, setAmount] = useState('');
  const [fromId, setFromId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setTarget('');
    setEditingTarget(false);
    setAmount('');
    setFromId(null);
    setRenaming(false);
    setMessage(null);
  };
  const close = () => {
    reset();
    onClose();
  };
  if (!goal) return <BottomSheet visible={false} title="" onClose={close}>{null}</BottomSheet>;

  const money = (minor: number) => formatMoneyWhole(minor, goal.currency);
  const progress = goal.targetAmount ? Math.min(1, goal.saved / goal.targetAmount) : null;
  const from = fromId ?? accounts[0]?.id ?? null;
  const track = dark ? colors.dark.field : colors.neutral[200];

  const saveTarget = async () => {
    const minor = parseAmountInput(target, goal.currency);
    if (!(minor > 0)) return setMessage({ text: t('error.amountPositive'), ok: false });
    await setGoalTarget(goal.id, minor, goal.currency);
    setEditingTarget(false);
    setMessage(null);
  };
  const deposit = async () => {
    const minor = parseAmountInput(amount, goal.currency);
    if (!(minor > 0)) return setMessage({ text: t('error.amountPositive'), ok: false });
    if (!from) return setMessage({ text: t('goal.noAccount'), ok: false });
    setBusy(true);
    const result = await addToSavings({ goalId: goal.id, amount: minor, currency: goal.currency, fromBankId: from, title: t('goal.entryTitle', { name: goal.name }) });
    setBusy(false);
    if (!result.ok) return setMessage({ text: t('state.error'), ok: false });
    setAmount('');
    setMessage({ text: t('goal.added', { amount: money(minor) }), ok: true });
  };
  const rename = async () => {
    if (!name.trim()) return;
    await renameCategory(goal.id, name);
    close();
  };
  const remove = () => confirmAction(t('goal.deleteTitle'), t('goal.deleteBody'), t('cat.delete'), t('common.cancel'), async () => {
    await deleteCategory(goal.id);
    close();
  });

  return (
    <BottomSheet visible title={goal.name} onClose={close}>
      {/* Progress */}
      <View style={{ gap: 8 }}>
        <Text variant="title" tone="primary-900">{money(goal.saved)}</Text>
        <Text variant="body-sm" tone="neutral-600">
          {goal.targetAmount ? t('goal.ofTarget', { target: money(goal.targetAmount), percent: Math.round((progress ?? 0) * 100) }) : t('goal.noTarget')}
        </Text>
        {progress !== null && (
          <View style={{ height: 8, borderRadius: 99, overflow: 'hidden', backgroundColor: track }}>
            <View style={{ width: `${progress * 100}%`, height: '100%', borderRadius: 99, backgroundColor: progress >= 1 ? colors.success : colors.primary[500] }} />
          </View>
        )}
        {progress !== null && progress >= 1 && <Text variant="caption" weight={600} style={{ color: colors.success }}>{t('goal.reached')}</Text>}
      </View>

      {/* Target */}
      {editingTarget || !goal.targetAmount ? (
        <View style={{ gap: 10 }}>
          <TextField variant="form" label={t('goal.target', { currency: goal.currency })} value={target} onChangeText={setTarget} keyboardType="decimal-pad" />
          <Button size="sm" variant="soft" label={t('goal.saveTarget')} onPress={saveTarget} />
        </View>
      ) : (
        <Button size="sm" variant="text" label={t('goal.changeTarget')} onPress={() => { setTarget(amountToInput(goal.targetAmount ?? 0, goal.currency)); setEditingTarget(true); }} />
      )}

      {/* Put money aside */}
      <View style={{ height: 1, backgroundColor: track }} />
      <Text variant="body" weight={700} tone="primary-900">{t('goal.add')}</Text>
      <TextField variant="form" label={t('goal.amount', { currency: goal.currency })} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      {accounts.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text variant="caption" tone="neutral-600">{t('goal.from')}</Text>
          <ChipRow>
            {accounts.map((b) => <Chip key={b.id} label={b.name} selected={from === b.id} onPress={() => setFromId(b.id)} />)}
          </ChipRow>
        </View>
      )}
      <Button size="sm" icon="savings" label={t('goal.move')} onPress={deposit} loading={busy} />
      {message && <Text variant="body-sm" style={{ color: message.ok ? colors.success : colors.danger }}>{message.text}</Text>}
      <Text variant="micro" tone="neutral-500">{t('goal.how')}</Text>

      {/* Own goals: rename / delete */}
      {!goal.builtIn && (
        renaming ? (
          <View style={{ gap: 10 }}>
            <TextField variant="form" label={t('cat.newName')} value={name} onChangeText={setName} autoFocus />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Button variant="soft" size="sm" label={t('common.cancel')} onPress={() => setRenaming(false)} /></View>
              <View style={{ flex: 1 }}><Button size="sm" label={t('common.save')} onPress={rename} disabled={!name.trim()} /></View>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button variant="soft" size="sm" icon="pencil" label={t('cat.rename')} onPress={() => { setName(goal.name); setRenaming(true); }} /></View>
            <View style={{ flex: 1 }}><Button variant="soft" size="sm" icon="close" label={t('cat.delete')} onPress={remove} /></View>
          </View>
        )
      )}
    </BottomSheet>
  );
}
