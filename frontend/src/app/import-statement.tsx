import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { StatusMark } from '@/components/HealthCharts';
import { Icon } from '@/components/Icon';
import { PickerModal } from '@/components/PickerModal';
import { ScreenShell } from '@/components/ScreenShell';
import { SelectField } from '@/components/SelectField';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useI18n, type TKey } from '@/i18n';
import { formatInputDate } from '@/lib/format';
import { formatMoney, getSettings, listBanks, type Bank, type Currency } from '@/services/bookkeeping';
import type { UploadAsset } from '@/services/documents';
import {
  hasPendingStatement, IMPORT_TYPES, importRows, pickStatementFile, prepareRows, readStatement, StatementImportError, takePendingStatement,
  toMinor, STATEMENT_MAX_BYTES,
  type ReviewRow, type StatementRead,
} from '@/services/statementImport';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

type Stage = 'pick' | 'reading' | 'review' | 'done';

const dateMs = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
};

/**
 * Bookkeeping > Import bank statement: choose a statement PDF, the server reads it, the owner reviews every row
 * (type, keep or skip) and only then are entries created. Likely duplicates and loans start unticked.
 */
export default function ImportStatement() {
  const router = useRouter();
  const { t } = useI18n();
  const dark = useAppTheme();
  // Straight to "Reading…" when a file was already chosen on the Bookkeeping tab.
  const [stage, setStage] = useState<Stage>(() => (hasPendingStatement() ? 'reading' : 'pick'));
  const [asset, setAsset] = useState<UploadAsset | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [read, setRead] = useState<StatementRead | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankId, setBankId] = useState<string | null>(null);
  const [picking, setPicking] = useState<number | null>(null); // row whose type is being chosen
  const [added, setAdded] = useState(0);
  const [skippedTransfers, setSkippedTransfers] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void listBanks().then((list) => { if (active) setBanks(list); });
    return () => { active = false; };
  }, []);

  const line = dark ? colors.dark.border : colors.neutral[200];
  const card = { borderRadius: radius.card, borderWidth: 1, borderColor: line, backgroundColor: dark ? colors.dark.surface : colors.white } as const;
  const cash = banks.find((b) => b.kind === 'cash') ?? null;
  const accounts = banks.filter((b) => b.kind !== 'cash');
  const bank = banks.find((b) => b.id === bankId) ?? null;
  const kept = rows.filter((r) => r.keep);

  const run = async (file: UploadAsset, pw?: string) => {
    setError(null);
    setStage('reading');
    try {
      const result = await readStatement(file, pw);
      const [settings, list] = await Promise.all([getSettings(), listBanks()]);
      setBanks(list);
      setRead(result);
      setRows(await prepareRows(result, settings.displayCurrency as Currency));
      // The account whose name matches the statement's bank, else the first bank account.
      const first = (result.bank ?? '').toLowerCase().split(' ')[0];
      const bankAccounts = list.filter((b) => b.kind !== 'cash');
      setBankId((bankAccounts.find((b) => first && b.name.toLowerCase().includes(first)) ?? bankAccounts[0] ?? list[0])?.id ?? null);
      setNeedsPassword(false);
      setStage('review');
    } catch (err) {
      const code = err instanceof StatementImportError ? err.code : null;
      setNeedsPassword(code === 'password' || code === 'wrong_password');
      setError(code ? t(`import.err.${code}` as TKey) : err instanceof Error ? err.message : t('state.error'));
      setStage('pick');
    }
  };

  const start = (file: UploadAsset) => {
    setAsset(file);
    setPassword('');
    if (file.size && file.size > STATEMENT_MAX_BYTES) {
      setStage('pick');
      return setError(t('import.err.too_large'));
    }
    void run(file);
  };

  const choose = async () => {
    const file = await pickStatementFile();
    if (file) start(file);
  };

  // The file chosen from the Bookkeeping button, read straight away. Taken inside the callback, so a development
  // double-mount (which cancels the first run) does not use it up.
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      const file = takePendingStatement();
      if (file) start(file);
    });
    return () => { active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!bank) return;
    setSaving(true);
    const count = await importRows(rows, bank, cash);
    setSkippedTransfers(!cash && kept.some((r) => r.typeId === 'transfer'));
    setAdded(count);
    setSaving(false);
    setStage('done');
  };

  const update = (index: number, patch: Partial<ReviewRow>) => setRows((current) => current.map((r) => (r.index === index ? { ...r, ...patch } : r)));
  const failing = (read?.checks ?? []).filter((c) => !c.passed);
  const pickerRow = rows.find((r) => r.index === picking);
  const typeOptions = useMemo(
    () => (pickerRow ? IMPORT_TYPES[pickerRow.direction].map((id) => ({ value: id as string, label: t(`type.${id}` as TKey) })) : []),
    [pickerRow, t],
  );

  if (stage === 'done') {
    return (
      <ScreenShell title={t('import.title')} nav="bookkeeping" padding={24}>
        <View style={{ ...card, padding: 24, alignItems: 'center', gap: 12 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colors.dark.field : colors.primary[50] }}>
            <Icon name="check" size={28} color={colors.success} />
          </View>
          <Text variant="title" weight={700} tone="primary-900" style={{ textAlign: 'center' }}>{t('import.done', { count: added })}</Text>
          <Text variant="body" tone="neutral-600" style={{ textAlign: 'center' }}>{t('import.doneBody')}</Text>
          {skippedTransfers && <Text variant="caption" tone="neutral-600" style={{ textAlign: 'center' }}>{t('import.noCash')}</Text>}
        </View>
        <View style={{ marginTop: 20 }}>
          <Button label={t('import.doneButton')} onPress={() => router.back()} />
        </View>
      </ScreenShell>
    );
  }

  if (stage !== 'review' || !read) {
    return (
      <ScreenShell title={t('import.title')} nav="bookkeeping" padding={24}>
        <View style={{ ...card, padding: 20, gap: 16 }}>
          <View style={{ width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colors.dark.field : colors.primary[50] }}>
            <Icon name="upload" size={24} color={colors.primary[500]} />
          </View>
          <Text variant="body" tone="neutral-900">{t('import.intro')}</Text>
          {stage === 'reading' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 }}>
              <ActivityIndicator color={colors.primary[500]} />
              <Text variant="body" tone="neutral-600">{t('import.reading')}</Text>
            </View>
          ) : needsPassword && asset ? (
            <View style={{ gap: 12 }}>
              <TextField variant="form" label={t('import.password')} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" error={error ?? undefined} />
              <Button label={t('import.open')} onPress={() => void run(asset, password)} disabled={!password} />
              <Button variant="text" size="sm" label={t('import.another')} onPress={() => void choose()} />
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {error && <Text variant="caption" tone="danger">{error}</Text>}
              <Button label={t('import.choose')} icon="upload" onPress={() => void choose()} />
            </View>
          )}
          <Text variant="caption" weight={400} tone="neutral-500">{t('import.privacy')}</Text>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={t('import.title')} nav="bookkeeping" padding={24}
      footer={<Button label={t('import.add', { count: kept.length })} onPress={() => void save()} disabled={!kept.length || !bank} loading={saving} />}>
      <View style={{ gap: 20 }}>
        {/* What was read, and whether it adds up */}
        <View style={{ ...card, padding: 16, gap: 10 }}>
          <Text variant="title" weight={700} tone="primary-900">{[read.bank, read.account].filter(Boolean).join(' · ') || t('import.title')}</Text>
          <Text variant="caption" weight={400} tone="neutral-600">
            {[read.period, t('import.summary', { count: rows.length, pages: read.pages })].filter(Boolean).join(' · ')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <StatusMark kind={failing.length ? 'watch' : 'good'} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="body" weight={600} tone="primary-900">{failing.length ? t('import.checksFail') : t('import.checksOk')}</Text>
              {failing.map((c) => <Text key={c.name} variant="caption" weight={400} tone="neutral-600">{c.name}: {c.detail}</Text>)}
            </View>
          </View>
        </View>

        <SelectField size="form" label={t('import.account')} options={(accounts.length ? accounts : banks).map((b) => ({ value: b.id, label: b.name }))}
          value={bankId} onChange={setBankId} />

        {/* One row per transaction */}
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setRows((current) => current.map((r) => ({ ...r, keep: kept.length !== current.length })))}>
              <Text variant="caption" weight={600} style={{ color: colors.primary[500] }}>{kept.length === rows.length ? t('import.selectNone') : t('import.selectAll')}</Text>
            </Pressable>
          </View>
          <View style={{ ...card, paddingHorizontal: 14 }}>
            {rows.map((row, i) => {
              const currency = row.currency ?? 'USD';
              const minor = toMinor(row.amount, currency);
              return (
                <View key={row.index} style={{ flexDirection: 'row', gap: 10, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: line, opacity: row.keep ? 1 : 0.55 }}>
                  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: row.keep }} hitSlop={8} onPress={() => update(row.index, { keep: !row.keep })} style={{ paddingTop: 2 }}>
                    <Icon name={row.keep ? 'checkSquare' : 'square'} size={20} color={row.keep ? colors.primary[500] : colors.neutral[500]} />
                  </Pressable>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <Text variant="body" weight={600} tone="primary-900" numberOfLines={2} style={{ flex: 1 }}>{row.description || '—'}</Text>
                      <Text variant="body" weight={700} tone={row.direction === 'out' ? 'expense' : 'primary-900'}>
                        {formatMoney(row.direction === 'out' ? -minor : minor, currency, { showPlus: true })}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Text variant="caption" weight={400} tone="neutral-600">{formatInputDate(dateMs(row.date))}</Text>
                      <Pressable accessibilityRole="button" accessibilityLabel={`${t('import.chooseType')}: ${t(`type.${row.typeId}` as TKey)}`} onPress={() => setPicking(row.index)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: dark ? colors.dark.field : colors.primary[50] }}>
                        <Text variant="caption" weight={600} style={{ color: dark ? colors.dark.primary : colors.primary[900] }}>{t(`type.${row.typeId}` as TKey)}</Text>
                        <Icon name="chevronDown" size={12} color={colors.primary[500]} />
                      </Pressable>
                      {row.learned && <Text variant="caption" weight={400} tone="neutral-500">{t('import.learned')}</Text>}
                    </View>
                    {(row.duplicate || row.loan) && (
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                        <StatusMark kind="watch" />
                        <Text variant="caption" weight={500} tone="neutral-900" style={{ flex: 1 }}>{t(row.duplicate ? 'import.duplicate' : 'import.loan')}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </View>
      <PickerModal visible={picking !== null} title={t('import.chooseType')} options={typeOptions} value={pickerRow?.typeId ?? null}
        onSelect={(typeId) => { if (picking !== null) update(picking, { typeId, learned: false }); }} onClose={() => setPicking(null)} />
    </ScreenShell>
  );
}
