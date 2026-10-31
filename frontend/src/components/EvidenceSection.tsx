import { useEffect, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Image, Modal, Platform, Pressable, View } from 'react-native';
import { Button } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n } from '@/i18n';
import { confirmAction } from '@/lib/confirm';
import { addEvidence, getEvidenceData, listEvidence, MAX_EVIDENCE_PER_ENTRY, removeEvidence, type NewEvidence } from '@/services/bookkeeping';
import { pickEvidence, type EvidenceSource } from '@/services/evidenceFiles';
import { colors, tint } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

/** A photo not saved with an entry yet (Add Entry keeps these until the entry is saved). */
export type DraftEvidence = NewEvidence & { key: string };

interface GalleryItem {
  id: string;
  name: string;
  /** the image as a data URI, or null while it loads */
  uri: string | null;
}

const THUMB = 72;

/**
 * Optional evidence for an entry: a photo of the receipt or invoice, so the record can be traced back later.
 * Shows the photos, a tile to add more, and a full-screen viewer.
 */
function EvidenceGallery({ items, onAdd, onRemove }: { items: GalleryItem[]; onAdd: (file: NewEvidence) => void | Promise<void>; onRemove: (id: string) => void }) {
  const { t } = useI18n();
  const dark = useAppTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [viewing, setViewing] = useState<GalleryItem | null>(null);
  const full = items.length >= MAX_EVIDENCE_PER_ENTRY;

  const pickFrom = async (source: EvidenceSource) => {
    setError(undefined);
    setBusy(true); // shrinking a photo can take a moment
    try {
      const file = await pickEvidence(source);
      if (file) await onAdd(file);
    } catch (e) {
      setError(e instanceof Error && e.message === 'permission' ? t(source === 'camera' ? 'evidence.cameraDenied' : 'evidence.photosDenied') : t('state.error'));
    } finally {
      setBusy(false);
    }
  };

  /** Phone: ask camera or gallery. Browser: the file picker. */
  const add = () => {
    if (full) return setError(t('evidence.full', { count: MAX_EVIDENCE_PER_ENTRY }));
    if (Platform.OS === 'web') return void pickFrom('library');
    const choices = [
      { label: t('docs.fromCamera'), source: 'camera' as const },
      { label: t('docs.fromPhotos'), source: 'library' as const },
    ];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: t('docs.uploadFrom'), options: [...choices.map((c) => c.label), t('common.cancel')], cancelButtonIndex: choices.length },
        (index) => { if (index < choices.length) void pickFrom(choices[index].source); },
      );
    } else {
      Alert.alert(t('docs.uploadFrom'), undefined, choices.map((c) => ({ text: c.label, onPress: () => void pickFrom(c.source) })), { cancelable: true });
    }
  };

  const tileBorder = dark ? colors.dark.border : colors.primary[200];

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="paperclip" size={16} color={dark ? colors.dark.primary : colors.primary[500]} />
        <Text variant="body" weight={500} tone="primary-900" style={{ fontSize: 14 }}>{t('evidence.title')}</Text>
      </View>
      <Text variant="micro" weight={300} tone="neutral-600">{t('evidence.hint')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {items.map((item, index) => (
          // The remove button is a sibling of the photo button, not inside it: on web a button cannot contain a button.
          <View key={item.id} style={{ width: THUMB, height: THUMB }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('evidence.photoLabel', { n: index + 1 })}
              onPress={() => item.uri && setViewing(item)}
              style={{ width: THUMB, height: THUMB, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: tileBorder, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colors.dark.field : colors.primary[50] }}
            >
              {item.uri ? <Image source={{ uri: item.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <ActivityIndicator color={colors.primary[500]} />}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('evidence.remove')}
              onPress={() => onRemove(item.id)}
              hitSlop={8}
              style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary[900] }}
            >
              <Icon name="close" size={12} color={colors.white} />
            </Pressable>
          </View>
        ))}
        {!full && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('evidence.add')}
            onPress={add}
            disabled={busy}
            style={{ width: THUMB, height: THUMB, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary[500], alignItems: 'center', justifyContent: 'center', gap: 2 }}
          >
            {busy ? <ActivityIndicator color={colors.primary[500]} /> : (
              <>
                <Icon name="camera" size={20} color={colors.primary[500]} />
                <Text variant="micro" weight={500} tone="primary-500">{t('evidence.add')}</Text>
              </>
            )}
          </Pressable>
        )}
      </View>
      {error ? <Text variant="caption" tone="danger">{error}</Text> : null}

      <Modal visible={viewing !== null} transparent animationType="fade" onRequestClose={() => setViewing(null)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: tint(colors.shadow, 0.9), padding: 16, justifyContent: 'center', gap: 16 }}>
          {viewing?.uri ? <Image source={{ uri: viewing.uri }} style={{ flex: 1 }} resizeMode="contain" accessibilityLabel={viewing.name} /> : null}
          <Button variant="soft" label={t('common.close')} onPress={() => setViewing(null)} />
        </View>
      </Modal>
    </View>
  );
}

/** Add Entry: photos are kept here until the entry is saved. */
export function DraftEvidenceSection({ items, onChange }: { items: DraftEvidence[]; onChange: (items: DraftEvidence[]) => void }) {
  return (
    <EvidenceGallery
      items={items.map((d) => ({ id: d.key, name: d.fileName, uri: d.dataUri }))}
      onAdd={(file) => onChange([...items, { ...file, key: `${Date.now()}-${items.length}` }])}
      onRemove={(key) => onChange(items.filter((d) => d.key !== key))}
    />
  );
}

/** Entry detail: the photos saved with this entry, with add and remove. */
export function SavedEvidenceSection({ transactionId }: { transactionId: string }) {
  const { t } = useI18n();
  const { data } = useLocalQuery(() => listEvidence(transactionId), [transactionId]);
  const [uris, setUris] = useState<Record<string, string>>({});

  // Load each photo's image once it is in the list; lists themselves never read image data.
  useEffect(() => {
    let active = true;
    for (const item of data ?? []) {
      if (uris[item.id]) continue;
      void getEvidenceData(item.id).then((uri) => { if (active && uri) setUris((old) => ({ ...old, [item.id]: uri })); });
    }
    return () => { active = false; };
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <EvidenceGallery
      items={(data ?? []).map((e) => ({ id: e.id, name: e.fileName, uri: uris[e.id] ?? null }))}
      onAdd={(file) => addEvidence(transactionId, [file])}
      onRemove={(id) => confirmAction(t('evidence.removeTitle'), t('evidence.removeBody'), t('evidence.remove'), t('common.cancel'), async () => { await removeEvidence(id); })}
    />
  );
}
