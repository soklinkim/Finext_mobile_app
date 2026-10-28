import { useCallback, useEffect, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, Pressable, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { useI18n, type TKey } from '@/i18n';
import { confirmAction } from '@/lib/confirm';
import {
  BUSINESS_DOCUMENT_KINDS,
  DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  deleteDocument,
  listDocuments,
  openDocument,
  pickPhoto,
  uploadDocument,
  type BusinessDocument,
  type BusinessDocumentKind,
  type UploadAsset,
} from '@/services/documents';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

const LABELS: Record<BusinessDocumentKind, TKey> = {
  patent_tax: 'docs.patentTax',
  certificate_of_incorporation: 'docs.incorporation',
};

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function ActionLink({ label, icon, onPress, tone = 'primary', disabled }: { label: string; icon?: IconName; onPress: () => void; tone?: 'primary' | 'danger'; disabled?: boolean }) {
  const color = tone === 'danger' ? colors.danger : colors.primary[900];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32, opacity: disabled ? 0.5 : 1 }}
    >
      {icon && <Icon name={icon} size={15} color={color} />}
      <Text variant="caption" weight={600} style={{ color }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Edit Profile: upload the Patent Tax certificate and the Certificate of Incorporation.
 * Files save to the server as soon as they are picked, independent of the "Update Profile" button.
 */
export function BusinessDocumentsSection() {
  const { t, locale } = useI18n();
  const dark = useAppTheme();
  const [documents, setDocuments] = useState<Partial<Record<BusinessDocumentKind, BusinessDocument>>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<BusinessDocumentKind | null>(null);
  const [errors, setErrors] = useState<Partial<Record<BusinessDocumentKind, string>>>({});

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    listDocuments()
      .then((list) => setDocuments(Object.fromEntries(list.map((doc) => [doc.kind, doc]))))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) load();
    });
    return () => {
      active = false;
    };
  }, [load]);

  const setError = (kind: BusinessDocumentKind, message?: string) => setErrors((current) => ({ ...current, [kind]: message }));

  const pickFrom = async (kind: BusinessDocumentKind, source: 'file' | 'camera' | 'library') => {
    setError(kind);
    let asset: UploadAsset | null = null;
    if (source === 'file') {
      const result = await DocumentPicker.getDocumentAsync({ type: DOCUMENT_TYPES, copyToCacheDirectory: true, multiple: false });
      if (result.canceled || !result.assets[0]) return;
      asset = result.assets[0];
    } else {
      setBusy(kind); // converting a photo can take a moment
      try {
        asset = await pickPhoto(source);
      } catch (error) {
        setBusy(null);
        return setError(kind, error instanceof Error && error.message === 'permission' ? t(source === 'camera' ? 'docs.cameraDenied' : 'docs.photosDenied') : t('state.error'));
      }
      setBusy(null);
      if (!asset) return;
    }
    if (asset.size && asset.size > MAX_DOCUMENT_BYTES) return setError(kind, t('docs.tooLarge'));
    setBusy(kind);
    try {
      const saved = await uploadDocument(kind, asset);
      setDocuments((current) => ({ ...current, [kind]: saved }));
    } catch (error) {
      setError(kind, error instanceof Error ? error.message : t('state.error'));
    } finally {
      setBusy(null);
    }
  };

  /** Phone: ask where the document comes from (camera, Photos or a file). Browser: the file picker accepts images too. */
  const pick = (kind: BusinessDocumentKind) => {
    if (Platform.OS === 'web') return void pickFrom(kind, 'file');
    const choices = [
      { label: t('docs.fromCamera'), source: 'camera' as const },
      { label: t('docs.fromPhotos'), source: 'library' as const },
      { label: t('docs.fromFiles'), source: 'file' as const },
    ];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: t('docs.uploadFrom'), options: [...choices.map((c) => c.label), t('common.cancel')], cancelButtonIndex: choices.length },
        (index) => { if (index < choices.length) void pickFrom(kind, choices[index].source); },
      );
    } else {
      // Android alerts hold three buttons: the three choices; tap outside to cancel.
      Alert.alert(t('docs.uploadFrom'), undefined, choices.map((c) => ({ text: c.label, onPress: () => void pickFrom(kind, c.source) })), { cancelable: true });
    }
  };

  const remove = (kind: BusinessDocumentKind) => confirmAction(t('docs.removeTitle'), t('docs.removeBody'), t('docs.remove'), t('common.cancel'), async () => {
    setError(kind);
    setBusy(kind);
    try {
      await deleteDocument(kind);
      setDocuments(({ [kind]: _removed, ...rest }) => rest);
    } catch (error) {
      setError(kind, error instanceof Error ? error.message : t('state.error'));
    } finally {
      setBusy(null);
    }
  });

  const view = async (kind: BusinessDocumentKind) => {
    setError(kind);
    try {
      await openDocument(kind);
    } catch (error) {
      setError(kind, error instanceof Error ? error.message : t('state.error'));
    }
  };

  const line = dark ? colors.dark.border : colors.neutral[200];

  // The heading sits above this card (on the screen that shows it); the card holds one row per document.
  return (
    <View style={{ borderRadius: radius.card, borderWidth: 1, borderColor: line, backgroundColor: dark ? colors.dark.surface : colors.white, paddingHorizontal: 16 }}>
      {loading ? (
        <ActivityIndicator color={colors.primary[500]} style={{ paddingVertical: 16 }} />
      ) : loadError ? (
        <View style={{ gap: 8, alignItems: 'flex-start', paddingVertical: 16 }}>
          <Text variant="body" tone="neutral-600">{t('docs.loadFailed')}</Text>
          <ActionLink label={t('state.retry')} onPress={load} />
        </View>
      ) : (
        BUSINESS_DOCUMENT_KINDS.map((kind, index) => {
          const doc = documents[kind];
          const isBusy = busy === kind;
          return (
            <View key={kind} style={{ gap: 10, paddingVertical: 14, borderTopWidth: index ? 1 : 0, borderTopColor: line }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: doc ? (dark ? colors.dark.field : colors.primary[50]) : dark ? colors.dark.subtle : colors.neutral[200] }}>
                  <Icon name={doc ? 'file' : 'upload'} size={20} color={doc ? colors.primary[500] : colors.neutral[500]} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text variant="body" weight={600} tone="primary-900">{t(LABELS[kind])}</Text>
                  {isBusy ? (
                    <Text variant="caption" weight={400} tone="neutral-600">{t('docs.uploading')}</Text>
                  ) : doc ? (
                    <Text variant="caption" weight={400} tone="neutral-600" numberOfLines={1}>
                      {doc.fileName} · {formatSize(doc.sizeBytes)} · {new Date(doc.uploadedAt).toLocaleDateString(locale === 'km' ? 'km-KH' : 'en-GB')}
                    </Text>
                  ) : (
                    <Text variant="caption" weight={400} tone="neutral-500">{t('docs.notUploaded')}</Text>
                  )}
                </View>
                {isBusy ? <ActivityIndicator color={colors.primary[500]} /> : doc ? <Icon name="check" size={18} color={colors.success} /> : null}
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, paddingLeft: 52 }}>
                <ActionLink label={t(doc ? 'docs.replace' : 'docs.upload')} icon="upload" onPress={() => void pick(kind)} disabled={busy !== null} />
                {doc && Platform.OS === 'web' && <ActionLink label={t('docs.view')} icon="eye" onPress={() => void view(kind)} disabled={isBusy} />}
                {doc && <ActionLink label={t('docs.remove')} icon="close" tone="danger" onPress={() => remove(kind)} disabled={busy !== null} />}
              </View>

              {errors[kind] ? <Text variant="caption" weight={400} tone="danger">{errors[kind]}</Text> : null}
            </View>
          );
        })
      )}
    </View>
  );
}
