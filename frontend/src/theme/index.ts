import type { TextStyle, ViewStyle } from 'react-native';
import { colors, radius, spacing, type } from './tokens';

export { colors, radius, spacing };

export type TypeToken = 'display' | 'title-lg' | 'title' | 'amount-xl' | 'amount-lg' | 'section' | 'body-lg' | 'body' | 'body-sm' | 'caption' | 'micro';
export type Locale = 'en-GB' | 'km';

const POPPINS: Record<number, string> = {
  300: 'Poppins_300Light',
  400: 'Poppins_400Regular',
  500: 'Poppins_500Medium',
  600: 'Poppins_600SemiBold',
  700: 'Poppins_700Bold',
};
const KHMER: Record<number, string> = {
  300: 'KantumruyPro_300Light',
  400: 'KantumruyPro_400Regular',
  500: 'KantumruyPro_500Medium',
  600: 'KantumruyPro_600SemiBold',
  700: 'KantumruyPro_700Bold',
};

/** Font family for a weight. Khmer uses Kantumruy Pro (Poppins has no Khmer glyphs). */
export function fontFamily(weight: number, locale: Locale = 'en-GB'): string {
  const table = locale === 'km' ? KHMER : POPPINS;
  return table[weight] ?? table[400];
}

/** Text style for a type token (§3). Amounts get tabular numbers. */
export function textStyle(token: TypeToken, locale: Locale = 'en-GB', weight?: number): TextStyle {
  const [fontSize, lineHeight, w] = type[token];
  return {
    fontSize,
    // Khmer is taller: give it extra line height so it is never clipped (§1.5)
    lineHeight: locale === 'km' ? Math.round(lineHeight * 1.2) : lineHeight,
    fontFamily: fontFamily(weight ?? w, locale),
    ...(token.startsWith('amount') ? { fontVariant: ['tabular-nums' as const] } : null),
  };
}

/** A semantic/brand colour at `alpha` over white, e.g. the 15% impact strips (§6.24). */
export function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Elevation (§4.3). RN shadow props + Android elevation.
export const shadow = {
  soft: {
    shadowColor: colors.primary[900],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 30,
    elevation: 2,
  } satisfies ViewStyle,
  /** header buttons (back, bell): a faint lift off the pale top band */
  icon: {
    shadowColor: colors.primary[900],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  } satisfies ViewStyle,
  button: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  } satisfies ViewStyle,
  footer: {
    shadowColor: colors.primary[900],
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  } satisfies ViewStyle,
  // RN has no inset shadow: selected states darken slightly with a bottom-weighted border instead.
  insetSelected: {
    borderTopWidth: 3,
    borderTopColor: tint(colors.shadow, 0.25),
  } satisfies ViewStyle,
};

export const textShadow = {
  textShadowColor: tint(colors.shadow, 0.25),
  textShadowOffset: { width: 0, height: 4 },
  textShadowRadius: 4,
} satisfies TextStyle;

export const REFERENCE_WIDTH = 430;
