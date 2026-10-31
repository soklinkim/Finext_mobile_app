import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { en, type TKey } from './en';
import { km } from './km';
import { PLAIN_KEYS, plainTerm } from './plain';
import { standardKhmerTerm } from './standardKm';
import type { Locale } from '@/theme';

export type { TKey, Locale };

const DICTIONARIES: Record<Locale, Record<TKey, string>> = { 'en-GB': en, km };

interface I18nValue {
  locale: Locale;
  /** Plain language on: everyday words instead of accounting terms. */
  plain: boolean;
  t: (key: TKey, params?: Record<string, string | number>) => string;
  /** A label sent by the server (statement line, ratio name): its plain word when plain language is on, or its official Khmer term in Khmer. */
  term: (label: string) => string;
  /** The other wording of a field label: the standard term when plain language is on, the everyday words when it is off. Null when the label has no counterpart. */
  alt: (label: string) => string | null;
}

const I18nContext = createContext<I18nValue>({
  locale: 'en-GB',
  plain: false,
  t: (key) => en[key],
  term: (label) => label,
  alt: () => null,
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
  // Server labels: everyday words in plain mode; in Khmer with standard terms, the official Khmer accounting term.
  const term = useCallback(
    (label: string) => (plain ? plainTerm(label, locale) ?? label : locale === 'km' ? standardKhmerTerm(label) ?? label : label),
    [locale, plain],
  );
  const altByLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const [key, plainText] of Object.entries(PLAIN_KEYS[locale]) as [TKey, string][]) {
      const standard = DICTIONARIES[locale][key] ?? en[key];
      if (!standard || !plainText || standard === plainText) continue;
      if (plain) map.set(plainText, standard);
      else map.set(standard, plainText);
    }
    return map;
  }, [locale, plain]);
  const alt = useCallback((label: string) => altByLabel.get(label.trim()) ?? null, [altByLabel]);
  const value = useMemo(() => ({ locale, plain, t, term, alt }), [locale, plain, t, term, alt]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Shows its children in standard accounting terms whatever the plain-language setting is (financial statements). */
export function StandardTerms({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  return <I18nProvider locale={locale} plain={false}>{children}</I18nProvider>;
}

export const useI18n = (): I18nValue => useContext(I18nContext);
