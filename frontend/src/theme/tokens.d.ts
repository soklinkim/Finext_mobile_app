export const colors: {
  primary: { 900: string; 500: string; 200: string; 50: string };
  mist: string;
  accent: { expense: string; tile: string; 'tile-strong': string };
  neutral: { 900: string; 600: string; 500: string; 300: string; 200: string };
  dark: { background: string; hero: string; surface: string; field: string; subtle: string; text: string; muted: string; faint: string; border: string; primary: string };
  danger: string;
  warning: string;
  success: string;
  alert: string;
  white: string;
  progress: { fill: string };
  shadow: string;
};
export const radius: {
  sm: number; field: number; md: number; lg: number; xl: number; '2xl': number;
  sheet: number; pill: number; nav: number; card: number;
};
export const spacing: Record<string | number, number>;
export const shadows: { softCss: string; buttonCss: string };
export const type: Record<string, [number, number, number]>;
