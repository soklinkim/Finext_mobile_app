import { Pressable, TextInput, View } from 'react-native';
import { Text } from './Text';
import { colors, fontFamily, shadow } from '@/theme';
import { useI18n } from '@/i18n';
import { convertMinor, formatAmountTyping, formatMoneyWhole, parseAmountInput, type Currency } from '@/services/bookkeeping';

/** §6.21 — white pill, 1 px primary-200 border, KHR | USD segments; selected = primary-900. */
export function CurrencySwitch({ value, onChange }: { value: Currency; onChange: (c: Currency) => void }) {
  return (
    <View accessibilityRole="radiogroup" className="flex-row rounded-pill bg-white border border-primary-200" style={{ padding: 2 }}>
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
            style={[{ paddingHorizontal: 10, paddingVertical: 5 }, selected && shadow.button]}
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
 * §6.20 — label "2. How much?" + primary-50 input: KHR | USD switch on the left,
 * symbol + big number on the right. KHR shows "About $600 at ៛4,000 = $1".
 */
export function CurrencyInput({ label, text, currency, onChangeText, onChangeCurrency, rate, error }: Props) {
  const { t, locale } = useI18n();
  const minor = parseAmountInput(text, currency);
  const symbol = currency === 'USD' ? '$' : '៛';
  const khrSymbolFont = fontFamily(500, 'km'); // Poppins has no ៛ glyph (§6.20)
  return (
    <View style={{ gap: 6 }}>
      <View className="flex-row items-center justify-between" style={{ gap: 12 }}>
        <Text variant="body" tone="primary-900" weight={500} style={{ fontSize: 14 }}>
          {label}
        </Text>
        <View
          className="flex-1 flex-row items-center justify-between bg-primary-50 rounded-lg"
          style={{ minHeight: 46, paddingHorizontal: 10, borderWidth: 2, borderColor: error ? colors.danger : 'transparent' }}
        >
          <CurrencySwitch value={currency} onChange={onChangeCurrency} />
          <View className="flex-1 flex-row items-center justify-end" style={{ gap: 4 }}>
            <Text variant="body-lg" tone="primary-500" style={{ fontFamily: currency === 'KHR' ? khrSymbolFont : undefined, fontSize: 18 }}>
              {symbol}
            </Text>
            <TextInput
              accessibilityLabel={label}
              value={text}
              onChangeText={(v) => onChangeText(formatAmountTyping(v, currency))}
              keyboardType={currency === 'USD' ? 'decimal-pad' : 'number-pad'}
              placeholder="0"
              placeholderTextColor={colors.neutral[500]}
              style={{ minWidth: 60, maxWidth: 160, textAlign: 'right', color: colors.primary[900], fontFamily: fontFamily(700, locale), fontSize: 24, paddingVertical: 4 }}
            />
          </View>
        </View>
      </View>
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
