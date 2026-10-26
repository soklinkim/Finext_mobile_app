import { createContext, useContext, type ReactNode } from 'react';

const AppThemeContext = createContext(false);

export function AppThemeProvider({ dark, children }: { dark: boolean; children: ReactNode }) {
  return <AppThemeContext.Provider value={dark}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme(): boolean {
  return useContext(AppThemeContext);
}
