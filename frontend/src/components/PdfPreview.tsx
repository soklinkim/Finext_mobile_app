import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from './Button';
import { HtmlPage } from './HtmlPage';
import { Icon } from './Icon';
import { Text } from './Text';
import { useI18n } from '@/i18n';
import { downloadPdf } from '@/services/pdfDownload';
import { colors } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

/** Width the preview lays the page out at: A4 (794 px) plus a grey margin either side. */
const PAGE_WIDTH = 840;

/** The PDF's page drawn as a sheet of paper on a grey desk; each .page of a multi-page document is its own sheet. */
const PREVIEW_CSS = `
  html { background: #e9edf3; }
  body { background: #fff; width: 794px; min-height: 1123px; box-sizing: border-box; margin: 16px auto; padding: 60px 53px; box-shadow: 0 2px 12px rgba(0,0,0,.12); }
  .page { padding-bottom: 48px; margin-bottom: 48px; border-bottom: 1px dashed #c8c8c8; }
  .page:last-child { padding-bottom: 0; margin-bottom: 0; border-bottom: 0; }`;

const previewOf = (html: string) =>
  html.replace('</head>', `<meta name="viewport" content="width=${PAGE_WIDTH}"><style>${PREVIEW_CSS}</style></head>`);

interface Props {
  /** the printable page; null keeps the preview closed */
  html: string | null;
  /** heading, and the saved file's name */
  title: string;
  onClose: () => void;
  failedMessage: string;
}

/** Full-screen preview of a PDF before it is saved: the page as it will print, and one Download button under it. */
export function PdfPreview({ html, title, onClose, failedMessage }: Props) {
  const { t } = useI18n();
  const dark = useAppTheme();
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const background = dark ? colors.dark.background : colors.white;

  const save = async () => {
    if (!html) return;
    setSaving(true);
    setFailed(false);
    try {
      await downloadPdf(html, title);
    } catch (error) {
      console.warn('PDF download failed', error);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    setFailed(false);
    onClose();
  };

  return (
    <Modal visible={html !== null} animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: background, paddingTop: insets.top }}>
        <View className="flex-row items-center" style={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={close} hitSlop={8} className="items-center justify-center" style={{ width: 40, height: 40 }}>
            <Icon name="close" size={22} color={dark ? colors.dark.primary : colors.primary[900]} />
          </Pressable>
          <Text variant="title" weight={600} tone="primary-900" numberOfLines={1} style={{ flex: 1 }} accessibilityRole="header">
            {title}
          </Text>
        </View>
        <View style={{ flex: 1, backgroundColor: '#e9edf3' }}>{html ? <HtmlPage html={previewOf(html)} pageWidth={PAGE_WIDTH} /> : null}</View>
        <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: insets.bottom + 12, gap: 8, backgroundColor: background }}>
          {failed ? <Text variant="caption" tone="danger">{failedMessage}</Text> : null}
          <Button label={t('stmt.download')} icon="download" onPress={save} loading={saving} loadingLabel={t('stmt.preparing')} />
        </View>
      </View>
    </Modal>
  );
}
