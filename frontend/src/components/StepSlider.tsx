import { useRef, useState } from 'react';
import { View, type GestureResponderEvent } from 'react-native';
import { colors, shadow } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

/**
 * A slider that snaps to steps, built on the touch responder so it needs no native module (works in Expo Go and on
 * web). `onChange` follows the finger (for live labels); `onCommit` fires once when the finger lifts.
 */
export function StepSlider({ value, min, max, step, onChange, onCommit, accessibilityLabel, accessibilityValue }: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
  accessibilityLabel: string;
  accessibilityValue: string;
}) {
  const dark = useAppTheme();
  const [width, setWidth] = useState(0);
  const dragged = useRef(value); // the value under the finger, read only in touch handlers

  // Every child starts at the left edge and the thumb ignores touches, so locationX is measured from the track's start.
  const at = (event: GestureResponderEvent) => {
    const share = Math.max(0, Math.min(1, event.nativeEvent.locationX / (width || 1)));
    return Math.max(min, Math.min(max, Math.round((min + share * (max - min)) / step) * step));
  };
  const follow = (event: GestureResponderEvent) => {
    const next = at(event);
    if (next !== dragged.current) {
      dragged.current = next;
      onChange(next);
    }
  };
  const adjust = (direction: 1 | -1) => {
    const next = Math.max(min, Math.min(max, value + direction * step));
    onChange(next);
    onCommit(next);
  };

  const share = max > min ? (value - min) / (max - min) : 0;
  const THUMB = 22;
  const fill = dark ? colors.dark.primary : colors.primary[500];
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: accessibilityValue }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => adjust(event.nativeEvent.actionName === 'increment' ? 1 : -1)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event) => {
        dragged.current = value;
        follow(event);
      }}
      onResponderMove={follow}
      onResponderRelease={() => onCommit(dragged.current)}
      onResponderTerminate={() => onCommit(dragged.current)}
      style={{ height: 32, justifyContent: 'center' }}
    >
      <View pointerEvents="none" style={{ height: 6, borderRadius: 3, backgroundColor: dark ? colors.dark.field : colors.neutral[200] }}>
        <View style={{ width: `${share * 100}%`, height: 6, borderRadius: 3, backgroundColor: fill }} />
      </View>
      {width > 0 && (
        <View pointerEvents="none" style={[{
          position: 'absolute', left: share * (width - THUMB), width: THUMB, height: THUMB, borderRadius: THUMB / 2,
          backgroundColor: colors.white, borderWidth: 2, borderColor: fill,
        }, shadow.soft]} />
      )}
    </View>
  );
}
