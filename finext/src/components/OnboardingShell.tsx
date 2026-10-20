import type { ReactNode } from 'react';
import { View } from 'react-native';
import { PageDots } from './PageDots';
import { ScreenShell } from './ScreenShell';
import { Text } from './Text';

interface Props {
  title: ReactNode | string;
  step: number; // 0-based
  steps?: number;
  /** compact left-aligned title in a short hero (form screens, §9 "Enter Business Assets") */
  form?: boolean;
  children: ReactNode;
}

/** Onboarding: no header row, no bottom nav, title centred in the hero (§5). Form screens use a short hero with a left title. */
export function OnboardingShell({ title, step, steps = 5, form = false, children }: Props) {
  return (
    <ScreenShell
      noHeader
      padding={24}
      hero={
        form ? (
          <View style={{ height: 80, justifyContent: 'center', paddingHorizontal: 24 }}>
            <Text variant="title-lg" tone="primary-900">
              {title}
            </Text>
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
