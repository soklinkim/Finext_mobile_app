import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenShell } from '@/components/ScreenShell';
import { StatementTile } from '@/components/StatementTile';
import { SummaryHero } from '@/components/SummaryHero';
import { useI18n, type TKey } from '@/i18n';
import type { StatementPeriod } from '@/services/analysis';

const TILES: { id: string; label: TKey; kind: 'income' | 'balance' | 'cashflow'; period?: StatementPeriod; icon: 'income' | 'layers' | 'swap' | 'calendar' | 'analysis' }[] = [
  { id: 'income', label: 'stmt.income', kind: 'income', icon: 'income' },
  { id: 'balance', label: 'stmt.balance', kind: 'balance', icon: 'layers' },
  { id: 'cashflow', label: 'stmt.cashflow', kind: 'cashflow', icon: 'swap' },
  { id: 'weekly', label: 'stmt.weekly', kind: 'income', period: 'weekly', icon: 'calendar' },
  { id: 'monthly', label: 'stmt.monthly', kind: 'income', period: 'monthly', icon: 'analysis' },
  { id: 'annual', label: 'stmt.annual', kind: 'income', period: 'annual', icon: 'calendar' },
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
            icon={tile.icon}
            selected={selected === tile.id}
            onPress={() => {
              setSelected(tile.id);
              router.push({ pathname: '/statement', params: { kind: tile.kind, ...(tile.period ? { period: tile.period } : {}) } });
            }}
          />
        ))}
        {/* One PDF for a lender: statements, ratios and the AI risk assessment (replaces the planned 'Add New Template'). */}
        <StatementTile label={t('pack.tile')} icon="file" selected={selected === 'pack'} onPress={() => { setSelected('pack'); router.push('/loan-pack'); }} />
      </View>
    </ScreenShell>
  );
}
