/**
 * Finext design tokens — FINEXT_STYLE_GUIDE_MERGED.md §13.
 * The ONLY place raw hex values live. Plain CommonJS so tailwind.config.js can read it too.
 */
const colors = {
  primary: { 900: '#0D47A1', 500: '#2196F3', 200: '#90CAF9', 50: '#E3F2FD' },
  accent: { expense: '#0068FF', tile: '#6CB4FF', 'tile-strong': '#3D9BFF' },
  neutral: { 900: '#343434', 600: '#898989', 500: '#989898', 300: '#CACACA', 200: '#E0E0E0' },
  danger: '#FF4267',
  warning: '#FFAF2A',
  success: '#52D5BA',
  alert: '#FB6B18',
  white: '#FFFFFF',
  progress: { fill: '#000000' },
  shadow: '#000000', // shadow colour base for rgba shadows
};

const radius = {
  sm: 10,
  field: 12,
  md: 18,
  lg: 20,
  xl: 22,
  '2xl': 40,
  sheet: 72,
  pill: 999,
  nav: 60,
  card: 16,
};

// 4-pt scale, §4.1
const spacing = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64, gutter: 36 };

const shadows = {
  softCss: '0 4px 30px rgba(54, 41, 183, 0.07)',
  buttonCss: '0 4px 4px rgba(0, 0, 0, 0.25)',
};

// Type scale, §3 — [fontSize, lineHeight, weight]
const type = {
  display: [28, 38, 600],
  'title-lg': [26, 36, 600],
  title: [20, 30, 600],
  'amount-xl': [24, 32, 700],
  'amount-lg': [20, 28, 600],
  section: [20, 28, 600],
  'body-lg': [16, 24, 500],
  body: [15, 22, 500],
  'body-sm': [13, 20, 400],
  caption: [12, 18, 500],
  micro: [11, 16, 400],
};

module.exports = { colors, radius, spacing, shadows, type };
