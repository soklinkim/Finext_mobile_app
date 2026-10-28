import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { ScreenShell } from '@/components/ScreenShell';
import { Text } from '@/components/Text';
import { useI18n } from '@/i18n';
import { getCheckIn, QUESTIONS, questionKey, saveCheckIn, scoreAnswers, type Answers } from '@/services/finHealth';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

/** Owner check-in: the eight FinHealth Score questions, worded and scored as the toolkit publishes them. */
export default function FinHealthCheckIn() {
  const router = useRouter();
  const { t } = useI18n();
  const dark = useAppTheme();
  const [answers, setAnswers] = useState<Answers>({});
  const [saving, setSaving] = useState(false);
  const answered = QUESTIONS.filter((q) => answers[q.id] !== undefined).length;
  const complete = scoreAnswers(answers) !== null;

  useEffect(() => {
    let active = true;
    void getCheckIn().then((saved) => { if (active && saved) setAnswers(saved.answers); });
    return () => { active = false; };
  }, []);

  const submit = async () => {
    setSaving(true);
    await saveCheckIn(answers);
    setSaving(false);
    router.back();
  };

  const card = { padding: 16, borderRadius: radius.card, backgroundColor: dark ? colors.dark.surface : colors.white, borderWidth: 1, borderColor: dark ? colors.dark.border : colors.neutral[200], gap: 10 } as const;

  return (
    <ScreenShell title={t('fh.title')} backFallbackHref="/analysis" nav="analysis" padding={24}
      footer={
        <View style={{ gap: 6 }}>
          <Text variant="micro" tone="neutral-600" style={{ textAlign: 'center' }}>{t('fh.progress', { count: answered })}</Text>
          <Button label={t('fh.submit')} onPress={() => void submit()} disabled={!complete} loading={saving} accessibilityHint={complete ? undefined : t('fh.answerAll')} />
        </View>
      }>
      <View style={{ gap: 14 }}>
        <Text variant="body-sm" tone="neutral-600">{t('fh.intro')}</Text>
        {QUESTIONS.map((q, index) => (
          <View key={q.id} style={card}>
            <Text variant="micro" weight={700} tone="neutral-500">{index + 1} / {QUESTIONS.length}</Text>
            {q.lead && <Text variant="body-sm" tone="neutral-600">{t(questionKey(q, 'lead'))}</Text>}
            <Text variant="body" weight={600} tone="primary-900">{t(questionKey(q))}</Text>
            {q.after && <Text variant="body-sm" tone="neutral-600">{t(questionKey(q, 'after'))}</Text>}
            <View accessibilityRole="radiogroup" style={{ gap: 6 }}>
              {q.points.map((_, option) => {
                const selected = answers[q.id] === option;
                return (
                  <Pressable key={option} accessibilityRole="radio" accessibilityState={{ selected }}
                    onPress={() => setAnswers((current) => ({ ...current, [q.id]: option }))}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 12, paddingVertical: 8,
                      borderRadius: 12, borderWidth: 1,
                      borderColor: selected ? colors.primary[500] : dark ? colors.dark.border : colors.neutral[200],
                      backgroundColor: selected ? (dark ? colors.dark.field : colors.primary[50]) : 'transparent',
                    }}>
                    <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: selected ? colors.primary[500] : colors.neutral[500], alignItems: 'center', justifyContent: 'center' }}>
                      {selected && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary[500] }} />}
                    </View>
                    <Text variant="body-sm" weight={selected ? 600 : 400} tone="primary-900" style={{ flex: 1 }}>{t(questionKey(q, option))}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
        <Text variant="micro" tone="neutral-500">{t('fh.credit')}</Text>
      </View>
    </ScreenShell>
  );
}
