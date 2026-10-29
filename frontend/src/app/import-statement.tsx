import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { StatusMark } from '@/components/HealthCharts';
import { Icon } from '@/components/Icon';
import { PickerModal } from '@/components/PickerModal';
import { ScreenShell } from '@/components/ScreenShell';
import { SelectField } from '@/components/SelectField';
import { SuccessMark } from '@/components/SuccessMark';
import { useErrorText } from '@/components/StateViews';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useI18n, type TKey } from '@/i18n';
import { formatInputDate } from '@/lib/format';
import { formatMoney, getEntryType, getSettings, GROUPS, listBanks, type Bank, type Currency } from '@/services/bookkeeping';
import type { UploadAsset } from '@/services/documents';
import {
  hasPendingStatement, IMPORT_TYPES, importRows, needsCheck, pickStatementFile, prepareRows, readStatement, StatementImportError, takePendingStatement,
  toMinor, STATEMENT_MAX_BYTES,
  type ReviewRow, type StatementRead,
} from '@/services/statementImport';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

type Stage = 'pick' | 'reading' | 'review' | 'check' | 'done';

/** Banks print descriptions in capitals ("SHOP RENT SEPTEMBER"); show them as ordinary words ("Shop Rent September"). */
const ABBREVIATIONS = new Set(['QR', 'KHQR', 'ATM', 'EDC', 'PPWSA', 'ABA', 'LPG', 'POS', 'ID', 'VAT', 'USD', 'KHR', 'SMS', 'PIN']);
const readable = (text: string) => (text === text.toUpperCase()
  ? text.replace(/\p{L}+/gu, (word) => (ABBREVIATIONS.has(word) ? word : word[0] + word.slice(1).toLowerCase()))
  : text);

const dateMs = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
};

/** The groups of the Bookkeeping tab's "Entries in …" list, in the same order, plus moves to and from Cash. */
const GROUP_ORDER = [...(Object.keys(GROUPS) as (keyof typeof GROUPS)[]), 'move'] as const;
const groupOf = (row: ReviewRow) => getEntryType(row.typeId)?.groupId ?? (row.direction === 'in' ? 'sales' : 'monthly');

/** One group of the summary, closed until tapped: the same look as the Bookkeeping tab's list. */
function PreviewGroup({ label, rows, currency, first }: { label: string; rows: ReviewRow[]; currency: Currency; first: boolean }) {
  const { t } = useI18n();
  const dark = useAppTheme();
  const [open, setOpen] = useState(false);
  const signed = (row: ReviewRow) => (row.direction === 'out' ? -1 : 1) * toMinor(row.amount, row.currency ?? currency);
  const total = rows.reduce((sum, row) => sum + signed(row), 0);
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: dark ? colors.dark.border : colors.neutral[200] }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((v) => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, paddingVertical: 8 }}>
        <View>
          <Text variant="body" weight={600} tone="primary-900">{label}</Text>
          <Text variant="caption" weight={300} tone="neutral-600">{t('overview.entries', { count: rows.length })}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="body" weight={700} tone="primary-900">{formatMoney(total, currency, { showPlus: true })}</Text>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={18} />
        </View>
      </Pressable>
      {open && rows.map((row) => (
        <View key={row.index} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingLeft: 14, minHeight: 48 }}>
          <View style={{ flex: 1 }}>
            <Text variant="body-sm" weight={500} tone="neutral-900" numberOfLines={1}>{readable(row.description) || '—'}</Text>
            <Text variant="caption" weight={300} tone="neutral-600">{formatInputDate(dateMs(row.date))} · {t(`type.${row.typeId}` as TKey)}</Text>
          </View>
          <Text variant="body-sm" weight={500} tone={row.direction === 'out' ? 'expense' : 'primary-900'}>{formatMoney(signed(row), row.currency ?? currency)}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Bookkeeping > Import bank statement.
 * Page 1 (review): what was read, grouped like the Bookkeeping tab's "Entries in …" list.
 * Page 2 (check): only the rows that need a decision (duplicates, loans, unknown types), then the final save.
 * After saving, "See entries" opens Bookkeeping on the month the entries were added to.
 */
export default function ImportStatement() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const dark = useAppTheme();
  const { isOffline } = useNetworkStatus();
  // Straight to "Reading…" when a file was already chosen on the Bookkeeping tab.
  const [stage, setStage] = useState<Stage>(() => (hasPendingStatement() ? 'reading' : 'pick'));
  const [asset, setAsset] = useState<UploadAsset | null>(null);
  const [password, setPassword] = useState('');
  const errorText = useErrorText();
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
  const [showAll, setShowAll] = useState(false); // on the check page: every row, not just the ones to check
  const [savedMonth, setSavedMonth] = useState<string | null>(null); // YYYY-MM of the newest entry added

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
      setError(code ? t(`import.err.${code}` as TKey) : errorText(err));
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
    setSavedMonth(kept.map((r) => r.date.slice(0, 7)).sort().pop() ?? null);
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
        <View style={{ ...card, padding: 24 }}>
          <SuccessMark>
            <Text variant="title" weight={700} tone="primary-900" style={{ textAlign: 'center' }}>{t('import.done', { count: added })}</Text>
            {/* Only worth saying if the connection dropped after the statement was read: online, they sync at once. */}
            {isOffline && <Text variant="body" tone="neutral-600" style={{ textAlign: 'center' }}>{t('import.doneBody')}</Text>}
            {skippedTransfers && <Text variant="caption" tone="neutral-600" style={{ textAlign: 'center' }}>{t('import.noCash')}</Text>}
          </SuccessMark>
        </View>
        <View style={{ marginTop: 20 }}>
          {/* Back to Bookkeeping on the month the entries are in, so they show under "Entries in …" straight away. */}
          <Button label={t('import.seeEntries')} onPress={() => (savedMonth
            ? router.dismissTo({ pathname: '/bookkeeping', params: { month: savedMonth } })
            : router.back())} />
        </View>
      </ScreenShell>
    );
  }

  // FIX: 'check' is a valid review stage too; before, it fell through to the "Choose PDF" screen.
  if ((stage !== 'review' && stage !== 'check') || !read) {
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

  // The period as words ("1 Sep – 30 Sep 2026"), and money in and out of the selected rows.
  const [from, to] = (read.period ?? '').split(' to ');
  const day = (iso: string, withYear: boolean) => new Date(dateMs(iso)).toLocaleDateString(locale === 'km' ? 'km-KH' : 'en-GB', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
  const period = from && to ? `${day(from, false)} – ${day(to, true)}` : read.period;
  const totalsCurrency: Currency = read.currency ?? kept[0]?.currency ?? 'USD';
  const sum = (direction: 'in' | 'out') => kept.filter((r) => r.direction === direction).reduce((total, r) => total + toMinor(r.amount, r.currency ?? totalsCurrency), 0);
  const totals = [
    { key: 'in', label: t('import.moneyIn'), minor: sum('in'), color: dark ? colors.success : colors.successText },
    { key: 'out', label: t('import.moneyOut'), minor: sum('out'), color: dark ? colors.dark.text : colors.neutral[900] },
  ];
  const toCheck = rows.filter(needsCheck);
  const groups = GROUP_ORDER.map((id) => ({ id, rows: kept.filter((r) => groupOf(r) === id) })).filter((g) => g.rows.length);
  const addButton = <Button label={t('import.add', { count: kept.length })} onPress={() => void save()} disabled={!kept.length || !bank} loading={saving} />;

  const renderRow = (row: ReviewRow, i: number) => {
    const currency = row.currency ?? 'USD';
    const minor = toMinor(row.amount, currency);
    const note = row.duplicate ? 'import.duplicate' : row.loan ? 'import.loan' : row.unsure ? 'import.unsure' : null;
    return (
      <View key={row.index} style={{ flexDirection: 'row', gap: 10, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: line, opacity: row.keep ? 1 : 0.55 }}>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: row.keep }} hitSlop={8} onPress={() => update(row.index, { keep: !row.keep })} style={{ paddingTop: 1 }}>
          <Icon name={row.keep ? 'checkSquare' : 'square'} size={18} color={row.keep ? colors.primary[500] : colors.neutral[500]} />
        </Pressable>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
            <Text variant="body-sm" weight={500} tone="neutral-900" numberOfLines={2} style={{ flex: 1 }}>{readable(row.description) || '—'}</Text>
            <Text variant="body-sm" weight={600} style={{ color: row.direction === 'out' ? (dark ? colors.dark.text : colors.neutral[900]) : dark ? colors.success : colors.successText }}>
              {formatMoney(row.direction === 'out' ? -minor : minor, currency, { showPlus: true })}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text variant="caption" weight={400} tone="neutral-500">{formatInputDate(dateMs(row.date))}</Text>
            <Text variant="caption" tone="neutral-500">·</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`${t('import.chooseType')}: ${t(`type.${row.typeId}` as TKey)}`} onPress={() => setPicking(row.index)} hitSlop={6}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Text variant="caption" weight={500} style={{ color: dark ? colors.dark.primary : colors.primary[500] }}>{t(`type.${row.typeId}` as TKey)}</Text>
              <Icon name="chevronDown" size={12} color={dark ? colors.dark.primary : colors.primary[500]} />
            </Pressable>
            {row.learned && <Text variant="caption" weight={400} tone="neutral-500">· {t('import.learned')}</Text>}
          </View>
          {note && (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
              <StatusMark kind="watch" />
              {/* FIX: cast to TKey so the typed translator accepts it */}
              <Text variant="caption" weight={500} tone="neutral-900" style={{ flex: 1 }}>{t(note as TKey)}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  // Page 2: only the rows that need a decision (or every row, on request), then the final save.
  if (stage === 'check') {
    const shown = showAll || !toCheck.length ? rows : toCheck;
    return (
      <ScreenShell title={t('import.checkTitle')} nav="bookkeeping" padding={24} footer={addButton}>
        <View style={{ gap: 16 }}>
          <Pressable accessibilityRole="button" onPress={() => setStage('review')} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
            <Icon name="chevronLeft" size={14} color={colors.primary[500]} />
            <Text variant="caption" weight={600} style={{ color: colors.primary[500] }}>{t('import.backToSummary')}</Text>
          </Pressable>
          {toCheck.length > 0 && !showAll && <Text variant="body" tone="neutral-900">{t('import.checkBody')}</Text>}
          <SelectField size="form" label={t('import.account')} options={(accounts.length ? accounts : banks).map((b) => ({ value: b.id, label: b.name }))}
            value={bankId} onChange={setBankId} />
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="caption" tone="neutral-600">{t('import.selected', { count: kept.length, total: rows.length })}</Text>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setRows((current) => current.map((r) => ({ ...r, keep: kept.length !== current.length })))}>
                <Text variant="caption" weight={600} style={{ color: colors.primary[500] }}>{kept.length === rows.length ? t('import.selectNone') : t('import.selectAll')}</Text>
              </Pressable>
            </View>
            <View style={{ ...card, paddingHorizontal: 14 }}>{shown.map(renderRow)}</View>
            {toCheck.length > 0 && toCheck.length < rows.length && (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setShowAll((v) => !v)} style={{ alignSelf: 'center', paddingVertical: 8 }}>
                <Text variant="caption" weight={600} style={{ color: colors.primary[500] }}>
                  {showAll ? t('import.showToCheck', { count: toCheck.length }) : t('import.showAll', { count: rows.length })}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
        <PickerModal visible={picking !== null} title={t('import.chooseType')} options={typeOptions} value={pickerRow?.typeId ?? null}
          onSelect={(typeId) => { if (picking !== null) update(picking, { typeId, learned: false, unsure: false }); }} onClose={() => setPicking(null)} />
      </ScreenShell>
    );
  }

  // Page 1: what was read, grouped the way the Bookkeeping tab lists a month.
  return (
    <ScreenShell title={t('import.title')} nav="bookkeeping" padding={24}
      footer={toCheck.length
        ? <Button label={t('import.next', { count: toCheck.length })} onPress={() => { setShowAll(false); setStage('check'); }} />
        : addButton}>
      <View style={{ gap: 20 }}>
        {/* What was read, and whether it adds up */}
        <View style={{ ...card, padding: 16, gap: 10 }}>
          <View style={{ gap: 2 }}>
            <Text variant="body" weight={700} tone="primary-900">{read.bank ?? t('import.statement')}{read.account ? `  ${read.account}` : ''}</Text>
            <Text variant="caption" weight={400} tone="neutral-600">
              {[period, t('import.summary', { count: rows.length, pages: read.pages })].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 20 }}>
            {totals.map(({ key, label, minor, color }) => (
              <View key={key} style={{ gap: 1 }}>
                <Text variant="micro" tone="neutral-600">{label}</Text>
                <Text variant="body-sm" weight={600} style={{ color }}>{formatMoney(minor, totalsCurrency)}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <StatusMark kind={failing.length ? 'watch' : 'good'} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="body" weight={600} tone="primary-900">{failing.length ? t('import.checksFail') : t('import.checksOk')}</Text>
              {failing.map((c) => <Text key={c.name} variant="caption" weight={400} tone="neutral-600">{c.name}: {c.detail}</Text>)}
            </View>
          </View>
        </View>

        {/* The entries that will be added, grouped like "Entries in …" on the Bookkeeping tab */}
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="body" weight={700} tone="primary-900">{t('import.entriesTitle')}</Text>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { setShowAll(true); setStage('check'); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 32 }}>
              <Text variant="caption" weight={600} style={{ color: colors.primary[500] }}>{t('import.edit')}</Text>
              <Icon name="chevronRight" size={14} color={colors.primary[500]} />
            </Pressable>
          </View>
          <View style={{ ...card, paddingHorizontal: 16, paddingVertical: 4 }}>
            {groups.map((g, i) => (
              <PreviewGroup key={g.id} first={i === 0} rows={g.rows} currency={totalsCurrency}
                label={t((g.id === 'move' ? 'import.transfers' : GROUPS[g.id].labelKey) as TKey)} />
            ))}
            {!groups.length && <Text variant="body-sm" tone="neutral-600" style={{ paddingVertical: 16 }}>{t('import.noneSelected')}</Text>}
          </View>
          {toCheck.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 4 }}>
              <StatusMark kind="watch" />
              <Text variant="caption" weight={500} tone="neutral-900" style={{ flex: 1 }}>{t('import.toCheck', { count: toCheck.length })}</Text>
            </View>
          )}
        </View>
      </View>
    </ScreenShell>
  );
}