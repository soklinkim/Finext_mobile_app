const { colors, radius, shadows } = require('./src/theme/tokens');

/** Tailwind reads every value from src/theme/tokens.js (style guide §13). No hex lives here. */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  // 'class' lets Expo force the light scheme (app.json userInterfaceStyle) without NativeWind throwing on web
  darkMode: 'class',
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: colors.primary,
        accent: colors.accent,
        neutral: colors.neutral,
        danger: colors.danger,
        warning: colors.warning,
        success: colors.success,
        alert: colors.alert,
        progress: colors.progress,
      },
      borderRadius: {
        sm: `${radius.sm}px`,
        field: `${radius.field}px`,
        md: `${radius.md}px`,
        lg: `${radius.lg}px`,
        xl: `${radius.xl}px`,
        '2xl': `${radius['2xl']}px`,
        sheet: `${radius.sheet}px`,
        pill: `${radius.pill}px`,
      },
      boxShadow: { soft: shadows.softCss, button: shadows.buttonCss },
    },
  },
  plugins: [],
};
