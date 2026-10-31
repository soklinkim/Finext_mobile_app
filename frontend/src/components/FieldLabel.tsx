import { useState, type ComponentProps } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { colors } from '@/theme';
import { useI18n } from '@/i18n';
import { useAppTheme } from '@/theme/AppTheme';

type Props = Omit<ComponentProps<typeof Text>, 'children'> & {
  label: string;
  /** shows a red * after the label */
  required?: boolean;
};

/**
 * A field name. When the label has another wording (standard accounting term <-> everyday words), a small (i) sits beside it;
 * hover (web) or tap shows the other wording. With standard terms on it explains the simple word, and the reverse.
 */
export function FieldLabel({ label, required, ...textProps }: Props) {
  const { alt, plain, t } = useI18n();
  const dark = useAppTheme();
  const [open, setOpen] = useState(false);
  const note = alt(label);

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text {...textProps} style={[{ flexShrink: 1 }, textProps.style]}>
          {label}
          {required ? <Text {...textProps} style={{ color: colors.danger }}> *</Text> : null}
        </Text>
        {note ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(plain ? 'info.standardIs' : 'info.plainIs', { term: note })}
            accessibilityState={{ expanded: open }}
            hitSlop={10}
            onPress={() => setOpen((o) => !o)}
            onHoverIn={() => setOpen(true)}
            onHoverOut={() => setOpen(false)}
          >
            <Icon name="info" size={14} color={dark ? colors.dark.primary : colors.primary[500]} />
          </Pressable>
        ) : null}
      </View>
      {note && open ? (
        <View style={{ alignSelf: 'flex-start', maxWidth: '100%', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: dark ? colors.dark.field : colors.primary[50] }}>
          <Text variant="caption" tone="primary-900">{t(plain ? 'info.standardIs' : 'info.plainIs', { term: note })}</Text>
        </View>
      ) : null}
    </View>
  );
}
