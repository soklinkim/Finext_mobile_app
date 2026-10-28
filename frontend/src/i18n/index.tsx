import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { en, type TKey } from './en';
import { km } from './km';
import { PLAIN_KEYS, plainTerm } from './plain';
import type { Locale } from '@/theme';

export type { TKey, Locale };

const DICTIONARIES: Record<Locale, Record<TKey, string>> = { 'en-GB': en, km };

interface I18nValue {
  locale: Locale;
  /** Plain language on: everyday words instead of accounting terms. */
  plain: boolean;
  t: (key: TKey, params?: Record<string, string | number>) => string;
  /** A label sent by the server (statement line, ratio name): its plain word when plain language is on. */
  term: (label: string) => string;
}

const I18nContext = createContext<I18nValue>({
  locale: 'en-GB',
  plain: false,
  t: (key) => en[key],
  term: (label) => label,
});

export function I18nProvider({ locale, plain = false, children }: { locale: Locale; plain?: boolean; children: ReactNode }) {
  const t = useCallback(
    (key: TKey, params?: Record<string, string | number>) => {
      let s = (plain ? PLAIN_KEYS[locale][key] : undefined) ?? DICTIONARIES[locale][key] ?? en[key] ?? key;
      if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
      return s;
    },
    [locale, plain],
  );
  const term = useCallback((label: string) => (plain ? plainTerm(label, locale) ?? label : label), [locale, plain]);
  const value = useMemo(() => ({ locale, plain, t, term }), [locale, plain, t, term]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = (): I18nValue => useContext(I18nContext);
