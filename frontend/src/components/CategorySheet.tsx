import { useState } from 'react';
import { View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Text } from './Text';
import { TextField } from './TextField';
import { TransactionRow } from './TransactionRow';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n } from '@/i18n';
import { confirmAction } from '@/lib/confirm';
import { deleteCategory, formatMoneyWhole, getCategorySpending, renameCategory } from '@/services/bookkeeping';
import { colors } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

const SHOWN = 20;

/** A spending category: what was spent with it this month and last, its entries, and rename / delete for custom ones. */
export function CategorySheet({ category, onClose }: { category: { id: string; name: string; builtIn: boolean } | null; onClose: () => void }) {
  const { t } = useI18n();
  const dark = useAppTheme();
  const id = category?.id ?? null;
  const { data } = useLocalQuery(() => (id ? getCategorySpending(id) : Promise.resolve(null)), [id]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const soft = dark ? colors.dark.field : colors.primary[50];

  const close = () => {
    setEditing(false);
    onClose();
  };
  const save = async () => {
    if (!category || !name.trim()) return;
    await renameCategory(category.id, name);
    setEditing(false);
    onClose();
  };
  const remove = () => {
    if (!category) return;
    confirmAction(t('cat.deleteTitle'), t('cat.deleteBody'), t('cat.delete'), t('common.cancel'), async () => {
      await deleteCategory(category.id);
      close();
    });
  };

  return (
    <BottomSheet visible={category !== null} title={category?.name ?? ''} onClose={close}>
      {data && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            { label: t('cat.thisMonth'), value: data.thisMonth },
            { label: t('cat.lastMonth'), value: data.lastMonth },
          ].map((item) => (
            <View key={item.label} style={{ flex: 1, padding: 12, borderRadius: 12, gap: 3, backgroundColor: soft }}>
              <Text variant="micro" tone="neutral-600">{item.label}</Text>
              <Text variant="body" weight={700} tone="primary-900" numberOfLines={1} adjustsFontSizeToFit>{formatMoneyWhole(item.value, data.currency)}</Text>
            </View>
          ))}
        </View>
      )}
      <Text variant="caption" weight={600} tone="neutral-600">{t('cat.entries')}</Text>
      {data && data.entries.length === 0 && <Text variant="body-sm" tone="neutral-600">{t('cat.noEntries')}</Text>}
      {data?.entries.slice(0, SHOWN).map((tx, index) => <TransactionRow key={tx.id} tx={tx} index={index} />)}
      {data && data.entries.length > SHOWN && <Text variant="micro" tone="neutral-500">{t('cat.more', { count: data.entries.length - SHOWN })}</Text>}

      {category && !category.builtIn && (
        editing ? (
          <View style={{ gap: 10 }}>
            <TextField variant="form" label={t('cat.newName')} value={name} onChangeText={setName} autoFocus />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Button variant="soft" size="sm" label={t('common.cancel')} onPress={() => setEditing(false)} /></View>
              <View style={{ flex: 1 }}><Button size="sm" label={t('common.save')} onPress={save} disabled={!name.trim()} /></View>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button variant="soft" size="sm" icon="pencil" label={t('cat.rename')} onPress={() => { setName(category.name); setEditing(true); }} /></View>
            <View style={{ flex: 1 }}><Button variant="soft" size="sm" icon="close" label={t('cat.delete')} onPress={remove} /></View>
          </View>
        )
      )}
    </BottomSheet>
  );
}
