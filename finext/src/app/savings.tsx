import { CategoryGrid } from '@/components/CategoryGrid';
import { ScreenShell } from '@/components/ScreenShell';
import { SummaryHero } from '@/components/SummaryHero';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n } from '@/i18n';
import { addCategory, listCategories } from '@/services/bookkeeping';

/** Savings goals — Travel, New House, Car, Wedding, "Add More". Goals are stored as categories of kind 'savings'. */
export default function Savings() {
  const { t } = useI18n();
  const { data } = useLocalQuery(() => listCategories('savings'), []);
  return (
    <ScreenShell title={t('screen.savings')} nav="bookkeeping" hero={<SummaryHero />}>
      <CategoryGrid
        key={data?.length}
        items={(data ?? []).map((c) => ({ id: c.id, name: c.name, icon: c.icon }))}
        addLabel={t('savings.addMore')}
        addTitle={t('savings.new')}
        onAdd={(name) => addCategory(name, 'savings', 'savings').then(() => undefined)}
      />
    </ScreenShell>
  );
}
