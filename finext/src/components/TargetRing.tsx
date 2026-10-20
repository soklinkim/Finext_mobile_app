import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { colors, radius } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface RingProps {
  percent: number;
  size?: number;
  stroke?: number;
  trackColor?: string;
  arcColor?: string;
  children?: React.ReactNode;
}

/** Progress ring starting at 12 o'clock, clockwise; animates from 0 over 600 ms (§12). */
export function ProgressRing({ percent, size = 100, stroke = 3, trackColor = colors.primary[50], arcColor = colors.accent.expense, children }: RingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(Math.min(Math.max(percent, 0), 100) / 100, { duration: 600, easing: Easing.out(Easing.ease) });
  }, [percent, p]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - p.value) }));
  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={arcColor} strokeWidth={stroke} strokeLinecap="round" fill="none" strokeDasharray={`${c}`} animatedProps={animatedProps} />
      </Svg>
      {children}
    </View>
  );
}

/** §6.9 — 170 × 170 accent-tile card, 100 px ring, % in the centre, label below. */
export function TargetCard({ percent, label }: { percent: number; label: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${percent}%`}
      className="items-center justify-center bg-accent-tile"
      style={{ width: 170, height: 170, borderRadius: radius['2xl'], gap: 4 }}
    >
      <ProgressRing percent={percent}>
        <Text variant="amount-lg" tone="white">
          {percent}%
        </Text>
      </ProgressRing>
      <Text variant="body" tone="primary-50">
        {label}
      </Text>
    </View>
  );
}

/** Hero variant (§6.9): 100 px ring on primary-200 with an icon inside and the label under it. */
export function GoalRing({ percent, icon, label }: { percent: number; icon: IconName; label: string }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${percent}%`} className="items-center" style={{ gap: 8 }}>
      <ProgressRing percent={percent} trackColor={colors.white}>
        <Icon name={icon} size={44} color={colors.primary[900]} strokeWidth={1.5} />
      </ProgressRing>
      <Text variant="body" tone="primary-900" style={{ textAlign: 'center' }}>
        {label}
      </Text>
    </View>
  );
}
