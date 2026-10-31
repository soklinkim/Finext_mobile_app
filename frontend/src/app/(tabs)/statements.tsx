import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { ScreenShell } from '@/components/ScreenShell';
import { StatementTile, TILE_COLUMN } from '@/components/StatementTile';
import { SummaryHero } from '@/components/SummaryHero';
import { Text } from '@/components/Text';
import { StandardTerms, useI18n, type TKey } from '@/i18n';
import type { StatementPeriod } from '@/services/analysis';
import { colors, radius, tint } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

const TILES: { id: string; label: TKey; kind: 'income' | 'balance' | 'cashflow'; period?: StatementPeriod; info?: TKey; icon: 'income' | 'layers' | 'swap' | 'calendar' | 'analysis' }[] = [
  { id: 'income', label: 'stmt.income', kind: 'income', info: 'stmt.info.income', icon: 'income' },
  { id: 'balance', label: 'stmt.balance', kind: 'balance', info: 'stmt.info.balance', icon: 'layers' },
  { id: 'cashflow', label: 'stmt.cashflow', kind: 'cashflow', info: 'stmt.info.cashflow', icon: 'swap' },
  { id: 'weekly', label: 'stmt.weekly', kind: 'income', period: 'weekly', icon: 'calendar' },
  { id: 'monthly', label: 'stmt.monthly', kind: 'income', period: 'monthly', icon: 'analysis' },
];

/** Financial Statements — template tiles (hero uses accent-tile, §5). */
export default function Statements() {
  // The statement list uses standard accounting terms whatever the plain-language setting is.
  return (
    <StandardTerms>
      <StatementsContent />
    </StandardTerms>
  );
}

function StatementsContent() {
  const router = useRouter();
  const { t } = useI18n();
  const dark = useAppTheme();
  const [selected, setSelected] = useState('income');
  const [info, setInfo] = useState<{ title: string; body: string } | null>(null);
  return (
    <ScreenShell title={t('screen.statements')} nav="statements" hero={<SummaryHero statusKey="budget.okSale" />}>
      <View className="flex-row flex-wrap justify-between" style={{ rowGap: 24 }}>
        {TILES.map((tile) => (
          <StatementTile
            key={tile.id}
            label={t(tile.label)}
            icon={tile.icon}
            selected={selected === tile.id}
            onInfoPress={tile.info ? () => setInfo({ title: t(tile.label), body: t(tile.info!) }) : undefined}
            infoLabel={tile.info ? `${t(tile.label)}: ${t('stmt.whatIsThis')}` : undefined}
            onPress={() => {
              setSelected(tile.id);
              router.push({ pathname: '/statement', params: { kind: tile.kind, ...(tile.period ? { period: tile.period } : {}) } });
            }}
          />
        ))}
        {/* One PDF for a lender: statements, ratios and the AI risk assessment (replaces the planned 'Add New Template'). */}
        <StatementTile label={t('pack.tile')} icon="file" selected={selected === 'pack'} onPress={() => { setSelected('pack'); router.push('/loan-pack'); }} />
        {/* Fill the last row to 3 slots so its tiles line up with the columns above. */}
        {Array.from({ length: (3 - ((TILES.length + 1) % 3)) % 3 }, (_, i) => <View key={`filler-${i}`} style={TILE_COLUMN} />)}
      </View>
      <Modal visible={info !== null} transparent animationType="fade" onRequestClose={() => setInfo(null)} statusBarTranslucent>
        <Pressable accessibilityLabel={t('common.close')} onPress={() => setInfo(null)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: tint(colors.shadow, 0.4) }}>
          <Pressable onPress={() => undefined} style={{ width: '100%', maxWidth: 360, padding: 24, gap: 16, borderRadius: radius.lg, backgroundColor: dark ? colors.dark.background : colors.white }}>
            <Text variant="title" weight={700} tone="primary-900">{info?.title}</Text>
            <Text variant="body" tone="neutral-900">{info?.body}</Text>
            <Button variant="soft" label={t('common.close')} onPress={() => setInfo(null)} />
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenShell>
  );
}
