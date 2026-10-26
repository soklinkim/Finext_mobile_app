import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { PageDots } from './PageDots';
import { ScreenShell } from './ScreenShell';
import { Text } from './Text';
import { radius } from '@/theme';

interface Props {
  title: ReactNode | string;
  subtitle?: ReactNode | string;
  step: number; // 0-based
  steps?: number;
  back?: boolean;
  /** compact left-aligned title in a short hero (form screens, §9 "Enter Business Assets") */
  form?: boolean;
  children: ReactNode;
}

/** Onboarding: back-only header, no bottom nav, title centred in the hero (§5). Form screens use a short hero with a left title. */
export function OnboardingShell({ title, subtitle, step, steps = 5, form = false, back = true, children }: Props) {
  const router = useRouter();
  const backFallbackHref =
    step === 0
      ? '/launch'
      : step === 1
        ? '/onboarding/language'
        : step === 2
          ? '/onboarding/start'
          : step === 3
            ? '/onboarding/start'
            : '/onboarding/start';

  return (
    <ScreenShell
      bell={false}
      back={back}
      backFallbackHref={backFallbackHref}
      padding={24}
      sheetRadius={form ? radius.xl : undefined}
      hero={
        form ? (
          <View style={{ minHeight: subtitle ? 112 : 80, justifyContent: 'center', paddingHorizontal: 24, gap: 4 }}>
            <Text variant="title-lg" weight={700} tone="primary-900">
              {title}
            </Text>
            {subtitle != null && (
              <Text variant="body-sm" tone="primary-900">
                {subtitle}
              </Text>
            )}
          </View>
        ) : (
          <View style={{ height: 232, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
            <Text variant="display" tone="primary-900" style={{ textAlign: 'center' }}>
              {title}
            </Text>
          </View>
        )
      }
    >
      {children}
      {!form && (
        <View style={{ marginTop: 24 }}>
          <PageDots count={steps} active={step} />
        </View>
      )}
    </ScreenShell>
  );
}
