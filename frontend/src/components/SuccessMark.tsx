import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { colors } from '@/theme';

const FEATHER = require('../../assets/images/feather.png');
const AnimatedPath = Animated.createAnimatedComponent(Path);
const TICK_LENGTH = 18; // length of the tick path below, for drawing it in

/**
 * A finished task: the FINEXT feather writes a little stroke, gives way to a green circle, and a tick draws in; then
 * `children` (the message) fades up. About a second. With reduced motion on, everything simply appears.
 */
export function SuccessMark({ size = 72, children }: { size?: number; children?: ReactNode }) {
  const reduce = useReducedMotion();
  const feather = useSharedValue(0);
  const sway = useSharedValue(0);
  const circle = useSharedValue(reduce ? 1 : 0);
  const tick = useSharedValue(reduce ? 1 : 0);
  const message = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    if (reduce) return;
    feather.value = withSequence(withTiming(1, { duration: 200 }), withDelay(320, withTiming(0, { duration: 180 })));
    sway.value = withSequence(withTiming(-14, { duration: 180 }), withTiming(10, { duration: 200 }), withTiming(0, { duration: 140 }));
    circle.value = withDelay(500, withSpring(1, { damping: 11, stiffness: 170 }));
    tick.value = withDelay(680, withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }));
    message.value = withDelay(900, withTiming(1, { duration: 280 }));
  }, [reduce, feather, sway, circle, tick, message]);

  const featherStyle = useAnimatedStyle(() => ({
    opacity: feather.value,
    transform: [{ scale: 0.8 + feather.value * 0.2 }, { rotate: `${sway.value}deg` }],
  }));
  const circleStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, circle.value * 1.5), transform: [{ scale: circle.value }] }));
  const tickProps = useAnimatedProps(() => ({ strokeDashoffset: TICK_LENGTH * (1 - tick.value) }));
  const messageStyle = useAnimatedStyle(() => ({ opacity: message.value, transform: [{ translateY: (1 - message.value) * 8 }] }));

  return (
    <View style={{ alignItems: 'center', gap: 16 }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' }, circleStyle]}>
          <Svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24">
            <AnimatedPath d="M6 12.5l4 4 8-9" stroke={colors.white} strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" fill="none"
              strokeDasharray={TICK_LENGTH} animatedProps={tickProps} />
          </Svg>
        </Animated.View>
        <Animated.Image source={FEATHER} resizeMode="contain" style={[{ position: 'absolute', width: size * 0.9, height: size * 0.9 }, featherStyle]} />
      </View>
      {children ? <Animated.View style={[{ alignItems: 'center', gap: 12, alignSelf: 'stretch' }, messageStyle]}>{children}</Animated.View> : null}
    </View>
  );
}
