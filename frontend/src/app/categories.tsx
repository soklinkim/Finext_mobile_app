import { CategoryGrid } from '@/components/CategoryGrid';
import { ScreenShell } from '@/components/ScreenShell';
import { SummaryHero } from '@/components/SummaryHero';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n } from '@/i18n';
import { addCategory, listCategories } from '@/services/bookkeeping';

/** Categories — spending categories grid (Food, Transport, Medicine, …) with a "More" tile that opens the New Category dialog. */
export default function Categories() {
  const { t } = useI18n();
  const { data } = useLocalQuery(() => listCategories('expense'), []);
  return (
    <ScreenShell title={t('screen.categories')} nav="bookkeeping" hero={<SummaryHero />}>
      <CategoryGrid
        key={data?.length}
        items={(data ?? []).map((c) => ({ id: c.id, name: c.name, icon: c.icon }))}
        addLabel={t('categories.more')}
        addTitle={t('categories.new')}
        onAdd={(name) => addCategory(name, 'expense', 'more').then(() => undefined)}
      />
    </ScreenShell>
  );
}
