import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { DateInput } from '@/components/DateInput';
import { StatusMark } from '@/components/HealthCharts';
import { Icon } from '@/components/Icon';
import { MultiSelectField } from '@/components/MultiSelectField';
import { PickerModal } from '@/components/PickerModal';
import { ScreenShell } from '@/components/ScreenShell';
import { SelectField } from '@/components/SelectField';
import { SuccessMark } from '@/components/SuccessMark';
import { useErrorText } from '@/components/StateViews';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useI18n, type TKey } from '@/i18n';
import { confirmAction } from '@/lib/confirm';
import { formatInputDate, sameDay } from '@/lib/format';
import { addBank, formatMoney, getAccountBalances, getEntryType, getSettings, listBanks, type Bank, type Currency } from '@/services/bookkeeping';
import type { UploadAsset } from '@/services/documents';
import {
  convertsOnImport, CONVERTED_MARK, hasPendingStatement, IMPORT_KHR_PER_USD, IMPORT_TYPES, importRows, rielToCents, needsCheck, pickStatementFile, prepareRows, readStatement, StatementImportError, statementTotals, takePendingStatement,
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

/** The import is about money in and money out: two groups (whatever each entry's type), plus moves to and from Cash. */
const GROUP_ORDER = ['in', 'out', 'move'] as const;
const GROUP_LABEL: Record<(typeof GROUP_ORDER)[number], TKey> = { in: 'import.moneyIn', out: 'import.moneyOut', move: 'import.transfers' };
const groupOf = (row: ReviewRow): (typeof GROUP_ORDER)[number] => (getEntryType(row.typeId)?.direction === 'move' ? 'move' : row.direction);

/** One group of the summary, closed until tapped: the same look as the Bookkeeping tab's list. */
function PreviewGroup({ label, rows, currency, first }: { label: string; rows: ReviewRow[]; currency: Currency; first: boolean }) {
  const { t, locale } = useI18n();
  const typeName = (id: string) => (id ? t(`type.${id}` as TKey) : t('import.noType'));
  const dark = useAppTheme();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<number | null>(null); // the row whose details are open
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
      {open && rows.map((row) => {
        const expanded = shown === row.index;
        const rowCurrency = row.currency ?? currency;
        const note = row.duplicate ? 'import.duplicate' : row.loan ? 'import.loan' : row.cashMove ? 'import.cashMove' : row.unsure ? 'import.unsure' : null;
        const details: { label: TKey; value: string }[] = [
          { label: 'import.detail.date', value: new Date(dateMs(row.date)).toLocaleDateString(locale === 'km' ? 'km-KH' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) },
          { label: 'import.detail.type', value: typeName(row.typeId) },
          { label: 'import.detail.amount', value: formatMoney(signed(row), rowCurrency, { showPlus: true }) },
          ...(row.balance !== null ? [{ label: 'import.detail.balance' as TKey, value: formatMoney(toMinor(row.balance, rowCurrency), rowCurrency) }] : []),
        ];
        return (
          <View key={row.index} style={{ paddingLeft: 14 }}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setShown(expanded ? null : row.index)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 48 }}>
              <View style={{ flex: 1 }}>
                <Text variant="body-sm" weight={500} tone="neutral-900" numberOfLines={expanded ? undefined : 1}>{readable(row.description) || '—'}</Text>
                <Text variant="caption" weight={300} tone="neutral-600">{formatInputDate(dateMs(row.date))} · {typeName(row.typeId)}</Text>
              </View>
              <Text variant="body-sm" weight={500} tone={row.direction === 'out' ? 'money-out' : 'money-in'}>{formatMoney(signed(row), rowCurrency)}</Text>
              <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={14} color={colors.neutral[500]} />
            </Pressable>
            {expanded && (
              <View style={{ gap: 8, padding: 12, marginBottom: 8, borderRadius: 10, backgroundColor: dark ? colors.dark.field : colors.primary[50] }}>
                {details.map((d) => (
                  <View key={d.label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                    <Text variant="caption" tone="neutral-600">{t(d.label)}</Text>
                    <Text variant="caption" weight={600} tone="primary-900" style={{ flexShrink: 1, textAlign: 'right' }}>{d.value}</Text>
                  </View>
                ))}
                {note && (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                    <StatusMark kind="watch" />
                    <Text variant="caption" tone="neutral-900" style={{ flex: 1 }}>{t(note as TKey)}</Text>
                  </View>
                )}
                <Text variant="micro" tone="neutral-500">{t('import.detail.edit')}</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Account summary: the statement's own figures next to what was detected, so the owner can check the totals agree
 * before looking at each entry. Detected = the rows read from the PDF (all of them, whatever is ticked to be added).
 */
function AccountSummary({ read, rows, currency }: { read: StatementRead; rows: ReviewRow[]; currency: Currency }) {
  const { t } = useI18n();
  const dark = useAppTheme();
  const statement = statementTotals(read, currency);
  const sum = (direction: 'in' | 'out') => rows.filter((r) => r.direction === direction).reduce((total, r) => total + toMinor(r.amount, r.currency ?? currency), 0);
  const detectedIn = sum('in');
  const detectedOut = sum('out');
  const opening = statement.opening;
  const detectedEnding = opening === null ? null : opening + detectedIn - detectedOut;
  // One minor unit of rounding is not a difference.
  const same = (a: number | null, b: number | null) => a === null || b === null || Math.abs(a - b) <= 1;
  const lines: { key: string; label: string; statement: number | null; detected: number | null; sign?: '+' | '-'; bold?: boolean; check: boolean }[] = [
    { key: 'opening', label: t('import.sum.opening'), statement: opening, detected: opening, check: false },
    { key: 'in', label: t('import.moneyIn'), statement: statement.moneyIn, detected: detectedIn, sign: '+', check: true },
    { key: 'out', label: t('import.moneyOut'), statement: statement.moneyOut, detected: detectedOut, sign: '-', check: true },
    { key: 'ending', label: t('import.endingBalance'), statement: statement.ending, detected: detectedEnding, bold: true, check: true },
  ];
  const allMatch = lines.filter((l) => l.check).every((l) => same(l.statement, l.detected));
  const ink = dark ? colors.dark.text : colors.neutral[900];
  const line = dark ? colors.dark.border : colors.neutral[200];
  const money = (minor: number | null, sign?: '+' | '-') => (minor === null ? '—' : `${sign ? (sign === '+' ? '+ ' : '- ') : ''}${formatMoney(Math.abs(minor), currency)}`);
  return (
    <View style={{ gap: 8 }}>
      <Text variant="body" weight={700} tone="primary-900">{t('import.sum.title')}</Text>
      <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: ink }}>
        <View style={{ flex: 1.1 }} />
        <Text variant="micro" weight={700} tone="neutral-600" style={{ flex: 1, textAlign: 'right' }}>{t('import.sum.statement')}</Text>
        <Text variant="micro" weight={700} tone="neutral-600" style={{ flex: 1, textAlign: 'right' }}>{t('import.sum.detected')}</Text>
        <View style={{ width: 16 }} />
      </View>
      {lines.map((l) => {
        const ok = !l.check || same(l.statement, l.detected);
        return (
          <View key={l.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2, ...(l.bold ? { borderTopWidth: 1, borderTopColor: line, paddingTop: 8 } : {}) }}>
            <Text variant="caption" weight={l.bold ? 700 : 400} tone="neutral-900" style={{ flex: 1.1 }}>{l.label}</Text>
            <Text variant="caption" weight={l.bold ? 700 : 500} tone="neutral-900" adjustsFontSizeToFit numberOfLines={1} style={{ flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{money(l.statement, l.sign)}</Text>
            <Text variant="caption" weight={l.bold ? 700 : 500} tone="neutral-900" adjustsFontSizeToFit numberOfLines={1} style={{ flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'], ...(ok ? {} : { color: dark ? colors.danger : colors.dangerText }) }}>{l.check || l.key === 'opening' ? money(l.detected, l.sign) : '—'}</Text>
            <View style={{ width: 16, alignItems: 'center' }}>{l.check ? <StatusMark kind={ok ? 'good' : 'bad'} /> : null}</View>
          </View>
        );
      })}
      <Text variant="micro" tone="neutral-500">{t('import.sum.calc')}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <StatusMark kind={allMatch ? 'good' : 'watch'} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="caption" weight={600} tone="primary-900">{t(allMatch ? 'import.sum.match' : 'import.sum.differs')}</Text>
          <Text variant="caption" tone="neutral-600">{t('import.sum.counts', { count: rows.length, in: rows.filter((r) => r.direction === 'in').length, out: rows.filter((r) => r.direction === 'out').length })}</Text>
        </View>
      </View>
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
  const typeName = (id: string) => (id ? t(`type.${id}` as TKey) : t('import.noType'));
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
  const [allRows, setAllRows] = useState<ReviewRow[]>([]); // every entry read from the statement (the Account summary always compares all of them)
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankId, setBankId] = useState<string | null>(null);
  const [picking, setPicking] = useState<number | null>(null); // row whose type is being chosen
  // Find entries on the check page: a day and/or categories, applied when Search is pressed (like the entries history).
  const [filterDate, setFilterDate] = useState<number | null>(null);
  const [filterCats, setFilterCats] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false); // choosing one type for every entry shown
  const [filterText, setFilterText] = useState('');
  // `ids`: the entries the search found at the moment Search was pressed. The list stays exactly these, so an entry does not
  // vanish from it when it is given a type; press Search again for a fresh result. null = no search.
  const [applied, setApplied] = useState<{ date: number | null; cats: string[]; text: string; ids: number[] | null }>({ date: null, cats: [], text: '', ids: null });
  // The entries the page lists when no search is applied: fixed when the page is opened (the ones to check, or all), so
  // typing an entry does not remove it from the list. null = every entry.
  const [listIds, setListIds] = useState<number[] | null>(null);
  const [added, setAdded] = useState(0);
  const [failed, setFailed] = useState<ReviewRow[]>([]); // kept rows that could not be added
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false); // on the check page: every row, not just the ones to check
  const [savedMonth, setSavedMonth] = useState<string | null>(null); // YYYY-MM of the newest entry added
  // After saving: the account's balance in FINEXT and the statement's ending balance, same currency (minor units).
  const [reconcile, setReconcile] = useState<{ bank: string; currency: Currency; now: number; ending: number } | null>(null);
  const [appCurrency, setAppCurrency] = useState<Currency>('USD'); // the currency FINEXT shows money in
  const [converted, setConverted] = useState(0); // entries changed from riel to dollars when saved

  useEffect(() => {
    let active = true;
    void listBanks().then((list) => {
      const seen = new Set<string>();
      if (active) setBanks(list.filter((b) => { const k = b.name.trim().toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }));
    });
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
      const [settings, all] = await Promise.all([getSettings(), listBanks()]);
      // One entry per account name (a second phone or reinstall can leave a copy of the starting accounts).
      const seen = new Set<string>();
      const list = all.filter((b) => {
        const key = b.name.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      // A statement from a bank that is not yet an account (ACLEDA, Canadia...) gets its account added.
      const statementBank = (result.bank ?? '').trim();
      const statementWord = statementBank.toLowerCase().split(' ')[0];
      if (statementBank && !list.some((b) => b.kind !== 'cash' && b.name.toLowerCase().includes(statementWord))) {
        list.push(await addBank(statementBank, 'bank'));
      }
      setBanks(list);
      setRead(result);
      setAppCurrency(settings.displayCurrency as Currency);
      const prepared = await prepareRows(result, settings.displayCurrency as Currency);
      setRows(prepared);
      setAllRows(prepared);
      // The account whose name matches the statement's bank, else the first bank account.
      const first = (result.bank ?? '').toLowerCase().split(' ')[0];
      const bankAccounts = list.filter((b) => b.kind !== 'cash');
      // Never Cash: a bank statement belongs to a bank or wallet account (and its cash deposits move money to Cash).
      setBankId((bankAccounts.find((b) => first && b.name.toLowerCase().includes(first)) ?? bankAccounts[0])?.id ?? null);
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
    const result = await importRows(rows, bank, cash, appCurrency);
    setFailed(result.failed);
    setConverted(result.converted);
    setSavedMonth(kept.map((r) => r.date.slice(0, 7)).sort().pop() ?? null);
    setAdded(result.added);
    // What was added is done: the entries left in the list are the ones still to sort out (no type yet, duplicates, loans).
    const notAdded = new Set(result.failed.map((r) => r.index));
    const addedIds = new Set(kept.filter((r) => !notAdded.has(r.index)).map((r) => r.index));
    setRows((current) => current.filter((r) => !addedIds.has(r.index)));
    // Does the account now end where the statement ends? Compared in the currency the entries were saved in.
    const statementCurrency: Currency = read?.currency ?? kept[0]?.currency ?? 'USD';
    const convert = convertsOnImport(statementCurrency, appCurrency);
    const currency: Currency = convert ? 'USD' : statementCurrency;
    const statementEnding = read ? statementTotals(read, statementCurrency).ending : null;
    const ending = statementEnding !== null && convert ? rielToCents(statementEnding) : statementEnding;
    const account = (await getAccountBalances()).find((a) => a.bankId === bank.id);
    setReconcile(ending !== null && account ? { bank: bank.name, currency, now: account.byCurrency[currency], ending } : null);
    setSaving(false);
    setStage('done');
  };

  /** Back to the check page with only the entries not added yet, so their types can be chosen and they can be added too. */
  const continueChecking = () => {
    setFilterText('');
    setFilterDate(null);
    setFilterCats([]);
    setApplied({ date: null, cats: [], text: '', ids: null });
    setListIds(null);
    setShowAll(true);
    setFailed([]);
    setStage('check');
  };

  /** The entries a search matches right now: every word in the description, the day, and any of the chosen categories. null = no search. */
  const findIds = (list: ReviewRow[], f: { date: number | null; cats: string[]; text: string }): number[] | null => {
    const words = f.text.toLowerCase().split(/\s+/).filter(Boolean);
    if (f.date === null && !f.cats.length && !words.length) return null;
    const matches = (row: ReviewRow, c: string) => (c === 'kind:in' ? row.direction === 'in' : c === 'kind:out' ? row.direction === 'out' : c === 'kind:check' ? needsCheck(row) : c === 'kind:untyped' ? !row.typeId : row.typeId === c);
    return list
      .filter((row) => words.every((w) => row.description.toLowerCase().includes(w)) && (f.date === null || sameDay(new Date(dateMs(row.date)), new Date(f.date))) && (!f.cats.length || f.cats.some((c) => matches(row, c))))
      .map((r) => r.index);
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
            {failed.some((r) => r.typeId === 'transfer') && !cash && <Text variant="caption" tone="neutral-600" style={{ textAlign: 'center' }}>{t('import.noCash')}</Text>}
            {converted > 0 && (
              <Text variant="caption" tone="neutral-600" style={{ textAlign: 'center' }}>
                {t('import.convertedDone', { count: converted, mark: CONVERTED_MARK, rate: IMPORT_KHR_PER_USD.toLocaleString('en-US') })}
              </Text>
            )}
          </SuccessMark>
        </View>
        {failed.length > 0 && (
          <View style={{ ...card, padding: 16, marginTop: 16, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <StatusMark kind="bad" />
              <Text variant="body-sm" weight={600} tone="neutral-900">{t('import.failed', { count: failed.length })}</Text>
            </View>
            {failed.map((row) => (
              <Text key={row.index} variant="caption" tone="neutral-600" numberOfLines={1}>
                {formatInputDate(dateMs(row.date))} · {readable(row.description) || '—'} · {formatMoney((row.direction === 'out' ? -1 : 1) * toMinor(row.amount, row.currency ?? 'USD'), row.currency ?? 'USD')}
              </Text>
            ))}
          </View>
        )}
        {reconcile && (() => {
          const diff = reconcile.now - reconcile.ending;
          // Within rounding counts as the same: one minor unit, or a cent for every two converted rows.
          const same = Math.abs(diff) <= Math.max(1, Math.ceil(converted / 2));
          const money = (minor: number) => formatMoney(minor, reconcile.currency);
          return (
            <View style={{ ...card, padding: 16, marginTop: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <StatusMark kind={same ? 'good' : 'watch'} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="body-sm" weight={500} tone="neutral-900">
                  {same ? t('import.balanceMatch', { bank: reconcile.bank, amount: money(reconcile.now) })
                    : t('import.balanceDiffers', { bank: reconcile.bank, amount: money(reconcile.now), ending: money(reconcile.ending), diff: formatMoney(Math.abs(diff), reconcile.currency) })}
                </Text>
                {!same && <Text variant="caption" tone="neutral-600">{t('import.balanceDiffersWhy')}</Text>}
              </View>
            </View>
          );
        })()}
        {/* Entries that were not added (no type chosen, duplicates, loans): go back and carry on with just those. */}
        {rows.length > 0 && (
          <View style={{ ...card, padding: 16, marginTop: 16, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <StatusMark kind="watch" />
              <Text variant="body-sm" weight={500} tone="neutral-900" style={{ flex: 1 }}>
                {t('import.leftOver', { count: rows.length, untyped: rows.filter((r) => !r.typeId).length })}
              </Text>
            </View>
            <Button variant="soft" label={t('import.continueTyping', { count: rows.length })} onPress={continueChecking} />
          </View>
        )}
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
    const reading = stage === 'reading';
    const locked = !reading && needsPassword && Boolean(asset);
    const accent = dark ? colors.dark.primary : colors.primary[500];
    return (
      <ScreenShell title={t('import.title')} nav="bookkeeping" padding={24}>
        {/* One centred column whose shape stays the same in every state: only the icon, title and action change. */}
        <View style={{ ...card, paddingHorizontal: 20, paddingVertical: 28, gap: 20, alignItems: 'center' }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colors.dark.field : colors.primary[50] }}>
            {reading ? <ActivityIndicator size="large" color={accent} />
              : <Icon name={locked ? 'lock' : 'upload'} size={28} color={accent} />}
          </View>
          <View style={{ gap: 6, alignItems: 'center' }} accessibilityLiveRegion="polite">
            <Text variant="title" weight={700} tone="primary-900" style={{ textAlign: 'center' }}>
              {t(reading ? 'import.reading' : locked ? 'import.lockedTitle' : 'import.pickTitle')}
            </Text>
            <Text variant="body-sm" tone="neutral-600" style={{ textAlign: 'center' }}>
              {t(reading ? 'import.readingBody' : locked ? 'import.lockedBody' : 'import.pickBody')}
            </Text>
          </View>
          {reading ? null : locked ? (
            <View style={{ alignSelf: 'stretch', gap: 12 }}>
              <TextField variant="form" label={t('import.password')} value={password} onChangeText={setPassword} secureTextEntry error={error ?? undefined} />
              <Button label={t('import.open')} onPress={() => void run(asset!, password)} disabled={!password} />
              <Button variant="text" size="sm" label={t('import.another')} onPress={() => void choose()} />
            </View>
          ) : (
            <View style={{ alignSelf: 'stretch', gap: 16 }}>
              {/* What happens, in three short steps. */}
              <View style={{ gap: 10 }}>
                {(['import.step1', 'import.step2', 'import.step3'] as const).map((key, index) => (
                  <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colors.dark.field : colors.primary[50] }}>
                      <Text variant="micro" weight={700} style={{ color: accent }}>{index + 1}</Text>
                    </View>
                    <Text variant="body-sm" tone="neutral-900" style={{ flex: 1 }}>{t(key)}</Text>
                  </View>
                ))}
              </View>
              {error && <Text variant="caption" tone="danger" style={{ textAlign: 'center' }}>{error}</Text>}
              <Button label={t('import.choose')} icon="upload" onPress={() => void choose()} />
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 6, marginTop: 14, paddingHorizontal: 8 }}>
          <Icon name="shield" size={14} color={colors.neutral[500]} />
          <Text variant="micro" tone="neutral-500" style={{ flexShrink: 1 }}>{t('import.privacy')}</Text>
        </View>
      </ScreenShell>
    );
  }

  // The period as words ("1 Sep – 30 Sep 2026"), and money in and out of the selected rows.
  const [from, to] = (read.period ?? '').split(' to ');
  const day = (iso: string, withYear: boolean) => new Date(dateMs(iso)).toLocaleDateString(locale === 'km' ? 'km-KH' : 'en-GB', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
  // Only dates written as YYYY-MM-DD can be formatted; any other wording of the period ("07-Aug-2026 - 05-Nov-2026") is shown as the statement prints it.
  const isoDay = /^\d{4}-\d{2}-\d{2}$/;
  const period = from && to && isoDay.test(from) && isoDay.test(to) ? `${day(from, false)} – ${day(to, true)}` : read.period;
  const totalsCurrency: Currency = read.currency ?? kept[0]?.currency ?? 'USD';
  const sum = (direction: 'in' | 'out') => kept.filter((r) => r.direction === direction).reduce((total, r) => total + toMinor(r.amount, r.currency ?? totalsCurrency), 0);
  // The statement's three main figures: money in, money out and where the balance ends.
  const statement = statementTotals(read, totalsCurrency);
  // A riel statement in a dollar app: checked in riel here, changed to dollars only when the owner taps Add.
  const convert = convertsOnImport(totalsCurrency, appCurrency);
  const inDollars = (minor: number | null) => (minor === null ? '—' : formatMoney(rielToCents(minor), 'USD'));
  const convertNotice = convert ? (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 10, backgroundColor: dark ? colors.dark.field : colors.primary[50] }}>
      <Text variant="body" weight={700} style={{ color: dark ? colors.dark.primary : colors.primary[500] }}>{CONVERTED_MARK}</Text>
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="body-sm" weight={600} tone="neutral-900">{t('import.convertTitle')}</Text>
        <Text variant="caption" tone="neutral-600">{t('import.convertBody', { rate: IMPORT_KHR_PER_USD.toLocaleString('en-US'), mark: CONVERTED_MARK })}</Text>
        <Text variant="caption" weight={500} tone="neutral-900">
          {t('import.convertTotals', { in: inDollars(statement.moneyIn), out: inDollars(statement.moneyOut), ending: inDollars(statement.ending) })}
        </Text>
      </View>
    </View>
  ) : null;
  const toCheck = rows.filter(needsCheck);
  const groups = GROUP_ORDER.map((id) => ({ id, rows: kept.filter((r) => groupOf(r) === id) })).filter((g) => g.rows.length);
  // Every entry to add needs a type the owner chose.
  const untyped = kept.filter((r) => !r.typeId).length;
  const addButton = (
    <View style={{ gap: 6 }}>
      {untyped > 0 ? <Text variant="caption" weight={600} tone="danger" style={{ textAlign: 'center' }}>{t('import.needTypes', { count: untyped })}</Text> : null}
      <Button label={t('import.add', { count: kept.length })} onPress={() => void save()} disabled={!kept.length || !bank || untyped > 0} loading={saving} />
    </View>
  );

  const renderRow = (row: ReviewRow, i: number) => {
    const currency = row.currency ?? 'USD';
    const minor = toMinor(row.amount, currency);
    const note = row.duplicate ? 'import.duplicate' : row.loan ? 'import.loan' : row.cashMove ? 'import.cashMove' : row.unsure ? 'import.unsure' : null;
    return (
      <View key={row.index} style={{ flexDirection: 'row', gap: 10, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: line, opacity: row.keep ? 1 : 0.55 }}>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: row.keep }} hitSlop={8} onPress={() => update(row.index, { keep: !row.keep })} style={{ paddingTop: 1 }}>
          <Icon name={row.keep ? 'checkSquare' : 'square'} size={18} color={row.keep ? colors.primary[500] : colors.neutral[500]} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <Text variant="body-sm" weight={500} tone="neutral-900" numberOfLines={2} style={{ flex: 1, minWidth: 0 }}>{readable(row.description) || '—'}</Text>
            {/* The amount keeps its width and stays on one line, so a long description or a big riel figure cannot push it off the card. */}
            <Text variant="body-sm" weight={600} numberOfLines={1} style={{ flexShrink: 0, textAlign: 'right', fontVariant: ['tabular-nums'], color: row.direction === 'out' ? (dark ? colors.danger : colors.dangerText) : dark ? colors.success : colors.successText }}>
              {formatMoney(row.direction === 'out' ? -minor : minor, currency, { showPlus: true })}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text variant="caption" weight={400} tone="neutral-500">{formatInputDate(dateMs(row.date))}</Text>
            <Text variant="caption" tone="neutral-500">·</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`${t('import.chooseType')}: ${typeName(row.typeId)}`} onPress={() => setPicking(row.index)} hitSlop={6}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Text variant="caption" weight={row.typeId ? 500 : 700} style={{ color: row.typeId ? (dark ? colors.dark.primary : colors.primary[500]) : (dark ? colors.danger : colors.dangerText) }}>{typeName(row.typeId)}</Text>
              <Icon name="chevronDown" size={12} color={dark ? colors.dark.primary : colors.primary[500]} />
            </Pressable>
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
    const idSet = new Set(applied.ids ?? listIds ?? rows.map((r) => r.index));
    // A search found a fixed set of entries; with no search, the list fixed when the page was opened.
    const shown = rows.filter((r) => idSet.has(r.index));
    const dirty = filterDate !== applied.date || filterText.trim() !== applied.text || filterCats.length !== applied.cats.length || filterCats.some((c) => !applied.cats.includes(c));
    // Back to the starting point: no keyword, no day, every category.
    const clearFilters = () => { setFilterText(''); setFilterDate(null); setFilterCats([]); setApplied({ date: null, cats: [], text: '', ids: null }); };
    const search = () => setApplied({ date: filterDate, cats: filterCats, text: filterText.trim(), ids: findIds(rows, { date: filterDate, cats: filterCats, text: filterText.trim() }) });
    const filtering = applied.ids !== null;
    // Only the entries found that are ticked (the ones that will be added) get the type; unticked ones are left alone.
    const shownTicked = shown.filter((r) => r.keep);
    // Setting one type for the ticked entries found: first say exactly where those entries will go, and only then change them.
    const applyBulkType = (typeId: string) => {
      const fits = shownTicked.filter((r) => (IMPORT_TYPES[r.direction] as readonly string[]).includes(typeId));
      if (!fits.length) return;
      const moneyIn = fits.filter((r) => r.direction === 'in').length;
      const moneyOut = fits.length - moneyIn;
      const typeLabel = t(`type.${typeId}` as TKey);
      const account = bank?.name ?? '—';
      const lines = [
        t('import.bulkWhere', { count: fits.length, type: typeLabel, account }),
        typeId === 'transfer' ? t('import.bulkTransfer', { account }) : '',
        t('import.bulkSplit', { in: moneyIn, out: moneyOut }),
        fits.length < shownTicked.length ? t('import.bulkSkipped', { count: shownTicked.length - fits.length }) : '',
      ].filter(Boolean);
      confirmAction(t('import.bulkTitle', { type: typeLabel }), lines.join('\n\n'), t('import.bulkYes'), t('common.cancel'), () => {
        const ids = new Set(fits.map((r) => r.index));
        setRows((current) => current.map((r) => (ids.has(r.index) ? { ...r, typeId, unsure: false, cashMove: false } : r)));
        // Carry on with the entries that still have no type: show just those, so the next batch can be picked straight away.
        setFilterText('');
        setFilterDate(null);
        setFilterCats(['kind:untyped']);
        const after = rows.map((r) => (ids.has(r.index) ? { ...r, typeId } : r));
        setApplied({ date: null, cats: ['kind:untyped'], text: '', ids: findIds(after, { date: null, cats: ['kind:untyped'], text: '' }) });
      });
    };
    // Money in and money out use different types, so each type in the list says how many of the selected entries it fits.
    const bulkOptions = [...new Set<string>([...IMPORT_TYPES.in, ...IMPORT_TYPES.out])]
      .map((id) => ({ id, count: shownTicked.filter((r) => (IMPORT_TYPES[r.direction] as readonly string[]).includes(id)).length }))
      .filter((o) => o.count > 0)
      .map((o) => ({ value: o.id, label: `${t(`type.${o.id}` as TKey)} · ${t('overview.entries', { count: o.count })}` }));
    const filterOptions = [
      { value: 'kind:in', label: t('tx.filterIn') },
      { value: 'kind:out', label: t('tx.filterOut') },
      { value: 'kind:untyped', label: t('import.filterNoType') },
      { value: 'kind:check', label: t('import.filterCheck') },
      ...[...new Set<string>([...IMPORT_TYPES.in, ...IMPORT_TYPES.out])].map((id) => ({ value: id, label: t(`type.${id}` as TKey) })),
    ];
    return (
      <ScreenShell title={t('import.checkTitle')} nav="bookkeeping" padding={24} footer={addButton}>
        <View style={{ gap: 16 }}>
          <Pressable accessibilityRole="button" onPress={() => setStage('review')} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
            <Icon name="chevronLeft" size={14} color={colors.primary[500]} />
            <Text variant="caption" weight={600} style={{ color: colors.primary[500] }}>{t('import.backToSummary')}</Text>
          </Pressable>
          {toCheck.length > 0 && !showAll && <Text variant="body" tone="neutral-900">{t('import.checkBody')}</Text>}
          {convertNotice}
          {accounts.length ? (
            <SelectField size="form" label={t('import.account')} options={accounts.map((b) => ({ value: b.id, label: b.name }))}
              value={bankId} onChange={setBankId} />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <StatusMark kind="watch" />
              <Text variant="body-sm" tone="neutral-900" style={{ flex: 1 }}>{t('import.needBank')}</Text>
            </View>
          )}
          <TextField variant="form" value={filterText} onChangeText={setFilterText} placeholder={t('import.searchDescription')} returnKeyType="search" onSubmitEditing={search} autoCorrect={false}
            left={<Icon name="search" size={16} color={colors.neutral[500]} />} />
          {/* Same search as the entries history: a day, categories (none = All) and Search, bright while there is something not yet searched. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1.1 }}><DateInput value={filterDate} onChange={setFilterDate} /></View>
            <View style={{ flex: 1 }}>
              <MultiSelectField title={t('search.categories')} searchable options={filterOptions} value={filterCats} onChange={setFilterCats}
                allLabel={t('tx.filterAll')} manyLabel={(count) => t('tx.categoriesCount', { count })} />
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.search')} accessibilityState={{ selected: dirty }} onPress={search}
              style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: dirty ? colors.primary[900] : dark ? colors.dark.field : colors.primary[200] }}>
              <Icon name="search" size={20} color={dirty ? colors.white : colors.primary[500]} />
            </Pressable>
          </View>
          {/* How far the typing has got: every entry needs a type before anything can be added. */}
          <View style={{ gap: 6, padding: 12, borderRadius: 10, backgroundColor: dark ? colors.dark.field : colors.primary[50] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <StatusMark kind={rows.every((r) => r.typeId) ? 'good' : 'watch'} />
              <Text variant="body-sm" weight={700} tone="primary-900" style={{ flex: 1 }}>
                {rows.every((r) => r.typeId) ? t('import.typesDone') : t('import.typeProgress', { done: rows.filter((r) => r.typeId).length, total: rows.length })}
              </Text>
            </View>
            {rows.some((r) => !r.typeId) && !(applied.cats.length === 1 && applied.cats[0] === 'kind:untyped' && !applied.text && applied.date === null && rows.filter((r) => !r.typeId).every((r) => applied.ids?.includes(r.index))) ? (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { setFilterText(''); setFilterDate(null); setFilterCats(['kind:untyped']); setApplied({ date: null, cats: ['kind:untyped'], text: '', ids: findIds(rows, { date: null, cats: ['kind:untyped'], text: '' }) }); }}>
                <Text variant="caption" weight={600} style={{ color: colors.primary[500] }}>{t('import.showNoType', { count: rows.filter((r) => !r.typeId).length })}</Text>
              </Pressable>
            ) : null}
          </View>
          {/* What the search found: how many entries, and what they add up to. */}
          {filtering ? (
            <View accessibilityLiveRegion="polite" style={{ gap: 2, padding: 12, borderRadius: 10, backgroundColor: dark ? colors.dark.field : colors.primary[50] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <Text variant="body-sm" weight={700} tone="primary-900" style={{ flex: 1 }}>{t('import.results', { count: shown.length, total: rows.length })}</Text>
                <Pressable accessibilityRole="button" hitSlop={8} onPress={clearFilters}>
                  <Text variant="caption" weight={600} style={{ color: colors.primary[500] }}>{t('import.clearFilter')}</Text>
                </Pressable>
              </View>
              <Text variant="caption" tone="neutral-600">
                {t('import.resultsTotals', { in: formatMoney(shown.filter((r) => r.direction === 'in').reduce((n, r) => n + toMinor(r.amount, r.currency ?? totalsCurrency), 0), totalsCurrency), out: formatMoney(shown.filter((r) => r.direction === 'out').reduce((n, r) => n + toMinor(r.amount, r.currency ?? totalsCurrency), 0), totalsCurrency) })}
              </Text>
            </View>
          ) : null}
          {shownTicked.length > 0 ? <Button size="sm" variant="soft" label={t('import.setTypeShown', { count: shownTicked.length })} onPress={() => setBulkOpen(true)} /> : null}
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="caption" tone="neutral-600">{filtering ? t('import.selectedShown', { count: shown.filter((r) => r.keep).length, total: shown.length }) : t('import.selected', { count: kept.length, total: rows.length })}</Text>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { const ids = new Set(shown.map((r) => r.index)); const allOn = shown.every((r) => r.keep); setRows((current) => current.map((r) => (ids.has(r.index) ? { ...r, keep: !allOn } : r))); }}>
                <Text variant="caption" weight={600} style={{ color: colors.primary[500] }}>{shown.length > 0 && shown.every((r) => r.keep) ? t('import.selectNone') : t('import.selectAll')}</Text>
              </Pressable>
            </View>
            <View style={{ ...card, paddingHorizontal: 14 }}>
              {shown.map(renderRow)}
              {!shown.length ? <Text variant="body-sm" tone="neutral-600" style={{ paddingVertical: 16 }}>{t('import.noResults')}</Text> : null}
            </View>
            {!filtering && toCheck.length > 0 && toCheck.length < rows.length && (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { setListIds(showAll ? rows.filter(needsCheck).map((r) => r.index) : null); setShowAll((v) => !v); }} style={{ alignSelf: 'center', paddingVertical: 8 }}>
                <Text variant="caption" weight={600} style={{ color: colors.primary[500] }}>
                  {showAll ? t('import.showToCheck', { count: toCheck.length }) : t('import.showAll', { count: rows.length })}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
        {/* One type for every entry shown (after searching, say, for a name): only entries it fits (money in or out) change. */}
        <PickerModal visible={bulkOpen} title={t('import.setTypeShown', { count: shownTicked.length })} options={bulkOptions} value={null}
          onSelect={(typeId) => applyBulkType(typeId)}
          onClose={() => setBulkOpen(false)} />
        <PickerModal visible={picking !== null} title={t('import.chooseType')} options={typeOptions} value={pickerRow?.typeId ?? null}
          onSelect={(typeId) => { if (picking !== null) update(picking, { typeId, learned: false, unsure: false, cashMove: false }); }} onClose={() => setPicking(null)} />
      </ScreenShell>
    );
  }

  // Page 1: what was read, grouped the way the Bookkeeping tab lists a month.
  return (
    <ScreenShell title={t('import.title')} nav="bookkeeping" padding={24}
      footer={toCheck.length
        ? <Button label={t('import.next', { count: toCheck.length })} onPress={() => { setShowAll(false); setListIds(rows.filter(needsCheck).map((r) => r.index)); setStage('check'); }} />
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
          <AccountSummary read={read} rows={allRows.length ? allRows : rows} currency={totalsCurrency} />
          {convertNotice}
          {kept.length !== rows.length && (
            <Text variant="caption" tone="neutral-600">
              {t('import.adding', { count: kept.length, total: rows.length, in: formatMoney(sum('in'), totalsCurrency), out: formatMoney(sum('out'), totalsCurrency) })}
            </Text>
          )}
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
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { setShowAll(true); setListIds(null); setStage('check'); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 32 }}>
              <Text variant="caption" weight={600} style={{ color: colors.primary[500] }}>{t('import.edit')}</Text>
              <Icon name="chevronRight" size={14} color={colors.primary[500]} />
            </Pressable>
          </View>
          <View style={{ ...card, paddingHorizontal: 16, paddingVertical: 4 }}>
            {groups.map((g, i) => (
              <PreviewGroup key={g.id} first={i === 0} rows={g.rows} currency={totalsCurrency}
                label={t(GROUP_LABEL[g.id])} />
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