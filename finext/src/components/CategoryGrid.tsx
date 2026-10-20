import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Button } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';
import { TextField } from './TextField';
import { colors, radius, tint } from '@/theme';
import { useI18n } from '@/i18n';

export interface GridItem {
  id: string;
  name: string;
  icon: string;
}

interface Props {
  items: GridItem[];
  /** label of the trailing "+" tile ("More" / "Add More") */
  addLabel: string;
  addTitle: string;
  onAdd: (name: string) => Promise<void> | void;
}

/** 3-column tile grid (Categories, Savings goals): 105 × 97 tiles, selected tile accent-expense, trailing "+" tile with a name dialog. */
export function CategoryGrid({ items, addLabel, addTitle, onAdd }: Props) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string | null>(items[0]?.id ?? null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();

  const tile = (key: string, label: string, icon: string, active: boolean, onPress: () => void, add = false) => (
    <Pressable key={key} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={onPress} className="items-center" style={{ width: 105, gap: 8 }}>
      <View className={`items-center justify-center ${active ? 'bg-accent-expense' : 'bg-accent-tile'}`} style={{ width: 105, height: 97, borderRadius: radius.xl }}>
        <Icon name={icon} size={add ? 48 : 44} color={colors.white} strokeWidth={add ? 2 : 1.5} />
      </View>
      <Text variant="caption" tone="primary-900" numberOfLines={2} style={{ textAlign: 'center' }}>
        {label}
      </Text>
    </Pressable>
  );

  const submit = async () => {
    if (!name.trim()) return setError(t('error.required'));
    await onAdd(name.trim());
    setName('');
    setError(undefined);
    setOpen(false);
  };

  return (
    <>
      <View className="flex-row flex-wrap justify-between" style={{ rowGap: 24 }}>
        {items.map((c) => tile(c.id, c.name, c.icon, selected === c.id, () => setSelected(c.id)))}
        {tile('add', addLabel, 'more', false, () => setOpen(true), true)}
      </View>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable className="flex-1 items-center justify-center px-6" style={{ backgroundColor: tint(colors.shadow, 0.35) }} onPress={() => setOpen(false)}>
          <Pressable className="w-full bg-white" style={{ borderRadius: radius.lg, padding: 24, gap: 16 }} onPress={() => undefined}>
            <Text variant="section" tone="primary-900">
              {addTitle}
            </Text>
            <TextField variant="form" label={t('categories.name')} value={name} onChangeText={setName} error={error} autoFocus />
            <View className="flex-row" style={{ gap: 12 }}>
              <View className="flex-1">
                <Button variant="soft" label={t('common.cancel')} onPress={() => setOpen(false)} />
              </View>
              <View className="flex-1">
                <Button label={t('common.save')} onPress={submit} />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
