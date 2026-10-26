import { useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { Text } from './Text';
import { colors, fontFamily, shadow } from '@/theme';
import { useI18n } from '@/i18n';
import { convertMinor, formatAmountTyping, formatMoneyWhole, parseAmountInput, type Currency } from '@/services/bookkeeping';
import { useAppTheme } from '@/theme/AppTheme';

/** §6.21 — white pill, 1 px primary-200 border, KHR | USD segments; selected = primary-900. */
export function CurrencySwitch({ value, onChange }: { value: Currency; onChange: (c: Currency) => void }) {
  const dark = useAppTheme();
  return (
    <View accessibilityRole="radiogroup" className="flex-row rounded-pill bg-white border border-primary-200" style={{ padding: 2, backgroundColor: dark ? colors.dark.surface : undefined, borderColor: dark ? colors.dark.border : undefined }}>
      {(['KHR', 'USD'] as const).map((c) => {
        const selected = c === value;
        return (
          <Pressable
            key={c}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            hitSlop={8}
            onPress={() => onChange(c)}
            className={`items-center justify-center rounded-pill ${selected ? 'bg-primary-900' : ''}`}
            style={[{ paddingHorizontal: 10, paddingVertical: 5, backgroundColor: selected && dark ? colors.primary[900] : undefined }, selected && shadow.button]}
          >
            <Text variant="micro" weight={selected ? 600 : 500} tone={selected ? 'white' : 'primary-900'}>
              {c}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface Props {
  label: string;
  text: string;
  currency: Currency;
  onChangeText: (t: string) => void;
  onChangeCurrency: (c: Currency) => void;
  rate: number;
  error?: string;
}

/**
 * §6.20 — "2. How much?" with the KHR | USD switch beside the label, then a full-width
 * amount field: large number next to its symbol, the whole box focuses the input, and the
 * border shows focus (blue) or an error (red). KHR shows "About $600 at ៛4,000 = $1".
 */
export function CurrencyInput({ label, text, currency, onChangeText, onChangeCurrency, rate, error }: Props) {
  const { t, locale } = useI18n();
  const dark = useAppTheme();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(false);
  const minor = parseAmountInput(text, currency);
  const symbol = currency === 'USD' ? '$' : '៛';
  const khrSymbolFont = fontFamily(500, 'km'); // Poppins has no ៛ glyph (§6.20)
  const borderColor = error ? colors.danger : focused ? colors.primary[500] : dark ? colors.dark.border : colors.primary[200];
  const amountColor = dark ? colors.dark.text : colors.primary[900];
  return (
    <View style={{ gap: 8 }}>
      <View className="flex-row items-center justify-between" style={{ gap: 12 }}>
        <Text variant="body" tone="primary-900" weight={500} style={{ fontSize: 14 }}>
          {label}
        </Text>
        <CurrencySwitch value={currency} onChange={onChangeCurrency} />
      </View>
      <Pressable
        accessible={false}
        onPress={() => input.current?.focus()}
        className="flex-row items-center rounded-lg"
        style={{ minHeight: 72, paddingHorizontal: 16, gap: 8, borderWidth: 2, borderColor, backgroundColor: dark ? colors.dark.field : colors.white }}
      >
        <Text style={{ fontFamily: currency === 'KHR' ? khrSymbolFont : fontFamily(600, locale), fontSize: 28, color: text ? amountColor : colors.primary[500] }}>
          {symbol}
        </Text>
        <TextInput
          ref={input}
          accessibilityLabel={label}
          value={text}
          onChangeText={(v) => onChangeText(formatAmountTyping(v, currency))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType={currency === 'USD' ? 'decimal-pad' : 'number-pad'}
          placeholder={currency === 'USD' ? '0.00' : '0'}
          placeholderTextColor={dark ? colors.dark.faint : colors.neutral[300]}
          style={[
            { flex: 1, minWidth: 0, color: amountColor, fontFamily: fontFamily(700, locale), fontSize: 32, paddingVertical: 8 },
            // The border already shows focus; hide the browser's own outline on web.
            Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
          ]}
        />
      </Pressable>
      {currency === 'KHR' && minor > 0 && (
        <Text variant="micro" weight={300} tone="neutral-600" style={{ textAlign: 'right' }}>
          {t('entry.aboutUsd', { usd: formatMoneyWhole(convertMinor(minor, 'KHR', 'USD', rate), 'USD'), rate: rate.toLocaleString('en-US') })}
        </Text>
      )}
      {error ? (
        <Text variant="caption" tone="danger" style={{ textAlign: 'right' }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
