import { useState } from 'react';
import { CategoryGrid } from '@/components/CategoryGrid';
import { GoalSheet } from '@/components/GoalSheet';
import { ScreenShell } from '@/components/ScreenShell';
import { SummaryHero } from '@/components/SummaryHero';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n } from '@/i18n';
import { addCategory, formatMoneyWhole, listSavingsGoals } from '@/services/bookkeeping';

/**
 * Savings goals — Travel, New House, Car, Wedding, "Add More". Goals are categories of kind 'savings' with a target;
 * tapping one shows its progress, sets the target and puts money aside (a transfer into the Savings account).
 */
export default function Savings() {
  const { t } = useI18n();
  const { data } = useLocalQuery(listSavingsGoals, []);
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <ScreenShell title={t('screen.savings')} nav="bookkeeping" hero={<SummaryHero />}>
      <CategoryGrid
        key={data?.length}
        items={(data ?? []).map((goal) => ({
          id: goal.id,
          name: goal.name,
          icon: goal.icon,
          progress: goal.targetAmount ? goal.saved / goal.targetAmount : null,
          caption: goal.targetAmount
            ? t('goal.short', { saved: formatMoneyWhole(goal.saved, goal.currency), target: formatMoneyWhole(goal.targetAmount, goal.currency) })
            : goal.saved > 0 ? formatMoneyWhole(goal.saved, goal.currency) : t('goal.setTargetShort'),
        }))}
        addLabel={t('savings.addMore')}
        addTitle={t('savings.new')}
        onAdd={(name) => addCategory(name, 'savings', 'savings').then(() => undefined)}
        onOpen={setOpenId}
      />
      {/* Looked up by id on every render, so progress updates right after money is put aside. */}
      <GoalSheet goal={data?.find((goal) => goal.id === openId) ?? null} onClose={() => setOpenId(null)} />
    </ScreenShell>
  );
}
