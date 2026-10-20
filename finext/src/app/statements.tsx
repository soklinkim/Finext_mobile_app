import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenShell } from '@/components/ScreenShell';
import { StatementTile } from '@/components/StatementTile';
import { SummaryHero } from '@/components/SummaryHero';
import { useI18n, type TKey } from '@/i18n';

const TILES: { id: string; label: TKey; kind: 'income' | 'balance' | 'cashflow' }[] = [
  { id: 'income', label: 'stmt.income', kind: 'income' },
  { id: 'balance', label: 'stmt.balance', kind: 'balance' },
  { id: 'cashflow', label: 'stmt.cashflow', kind: 'cashflow' },
  // Weekly / Monthly / Annual are presets of the same three statements over a different period
  { id: 'weekly', label: 'stmt.weekly', kind: 'income' },
  { id: 'monthly', label: 'stmt.monthly', kind: 'income' },
  { id: 'annual', label: 'stmt.annual', kind: 'income' },
];

/** Financial Statements — template tiles (hero uses accent-tile, §5). */
export default function Statements() {
  const router = useRouter();
  const { t } = useI18n();
  const [selected, setSelected] = useState('income');
  return (
    <ScreenShell title={t('screen.statements')} heroTone="tile" lightHeader nav="statements" hero={<SummaryHero statusKey="budget.okSale" />}>
      <View className="flex-row flex-wrap justify-between" style={{ rowGap: 24 }}>
        {TILES.map((tile) => (
          <StatementTile
            key={tile.id}
            label={t(tile.label)}
            selected={selected === tile.id}
            onPress={() => {
              setSelected(tile.id);
              router.push({ pathname: '/statement', params: { kind: tile.kind } });
            }}
          />
        ))}
        <StatementTile add label={t('stmt.addTemplate')} onPress={() => Alert.alert(t('stmt.addTemplate'), t('common.comingSoon'))} />
      </View>
    </ScreenShell>
  );
}
