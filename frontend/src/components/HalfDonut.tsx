import { View } from 'react-native';
import Svg, { G, Path, Text as SvgText } from 'react-native-svg';
import { Text } from './Text';
import { colors, fontFamily } from '@/theme';
import { useI18n } from '@/i18n';

export interface DonutSlice {
  name: string;
  percent: number;
}

// Segment colours in order (§6.8)
const SEGMENT_COLORS = [colors.accent.expense, colors.accent.tile, colors.primary[500]];

const W = 300;
const H = 160;
const CX = W / 2;
const CY = 150;
const R_OUT = 140;
const R_IN = 80;
const GAP_DEG = 2.2; // ≈ 3 px white gap between segments

const polar = (r: number, deg: number) => ({
  x: CX + r * Math.cos((Math.PI * deg) / 180),
  y: CY - r * Math.sin((Math.PI * deg) / 180),
});

function arcPath(startDeg: number, endDeg: number): string {
  const a = polar(R_OUT, startDeg);
  const b = polar(R_OUT, endDeg);
  const c = polar(R_IN, endDeg);
  const d = polar(R_IN, startDeg);
  const large = Math.abs(startDeg - endDeg) > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${R_OUT} ${R_OUT} 0 ${large} 1 ${b.x} ${b.y} L ${c.x} ${c.y} A ${R_IN} ${R_IN} 0 ${large} 0 ${d.x} ${d.y} Z`;
}

/** §6.8 — 180° semicircle, white gaps, % labels inside, dot legend underneath. */
export function HalfDonut({ slices }: { slices: DonutSlice[] }) {
  const { locale } = useI18n();
  const total = slices.reduce((s, x) => s + x.percent, 0) || 1;
  let cursor = 180; // sweeps from the left (180°) over the top to the right (0°)
  const arcs = slices.map((s, i) => {
    const sweep = (s.percent / total) * 180;
    const start = cursor;
    const end = cursor - sweep;
    cursor = end;
    const mid = (start + end) / 2;
    return { ...s, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length], d: arcPath(start - GAP_DEG / 2, end + GAP_DEG / 2), label: polar((R_IN + R_OUT) / 2, mid) };
  });
  return (
    <View className="items-center" style={{ gap: 16 }}>
      <View accessible accessibilityRole="image" accessibilityLabel={slices.map((s) => `${s.name} ${s.percent}%`).join(', ')}>
        <Svg width={W} height={H}>
          {arcs.map((a) => (
            <G key={a.name}>
              <Path d={a.d} fill={a.color} />
              <SvgText x={a.label.x} y={a.label.y + 5} fill={colors.white} fontSize={16} fontWeight="600" textAnchor="middle" fontFamily={fontFamily(600, locale)}>
                {a.percent}%
              </SvgText>
            </G>
          ))}
        </Svg>
      </View>
      <View className="flex-row flex-wrap justify-center" style={{ gap: 16 }}>
        {arcs.map((a) => (
          <View key={a.name} className="flex-row items-center" style={{ gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: a.color }} />
            <Text variant="caption" weight={600} tone="primary-900">
              {a.name}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
