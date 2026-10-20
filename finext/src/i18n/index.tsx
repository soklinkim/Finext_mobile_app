import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { en, type TKey } from './en';
import { km } from './km';
import type { Locale } from '@/theme';

export type { TKey, Locale };

const DICTIONARIES: Record<Locale, Record<TKey, string>> = { 'en-GB': en, km };

interface I18nValue {
  locale: Locale;
  t: (key: TKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue>({
  locale: 'en-GB',
  t: (key) => en[key],
});

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = useCallback(
    (key: TKey, params?: Record<string, string | number>) => {
      let s = DICTIONARIES[locale][key] ?? en[key] ?? key;
      if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
      return s;
    },
    [locale],
  );
  const value = useMemo(() => ({ locale, t }), [locale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = (): I18nValue => useContext(I18nContext);
