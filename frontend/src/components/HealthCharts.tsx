import { useState, type ReactNode } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { Icon } from './Icon';
import { Text } from './Text';
import { colors } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

/** Shared SVG pieces for the Health tab: thin marks, rounded ends, a 2px surface gap between fills. */

export function useChartColors() {
  const dark = useAppTheme();
  return {
    dark,
    surface: dark ? colors.dark.surface : colors.white,
    ink: dark ? colors.dark.text : colors.primary[900],
    muted: dark ? colors.dark.muted : colors.neutral[600],
    grid: dark ? colors.dark.border : colors.neutral[200],
    track: dark ? colors.dark.field : colors.neutral[200],
    series: dark ? colors.dark.primary : colors.primary[500],
  };
}

/** SVG needs pixel widths: measure the container once it is laid out. */
function useWidth(): [number, (event: LayoutChangeEvent) => void] {
  const [width, setWidth] = useState(0);
  return [width, (event) => setWidth(Math.round(event.nativeEvent.layout.width))];
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

export type MarkKind = 'good' | 'watch' | 'bad' | 'none';
const MARK_COLOR: Record<MarkKind, string> = { good: colors.success, watch: colors.warning, bad: colors.danger, none: colors.neutral[500] };

/** Good / watch / bad / no data as a tinted round icon (✓ ! ✕ –), so the state never rests on colour alone. */
export function StatusMark({ kind }: { kind: MarkKind }) {
  const color = MARK_COLOR[kind];
  return (
    <View style={{ width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: `${color}26` }}>
      {kind === 'good' ? <Icon name="check" size={12} color={color} strokeWidth={3} />
        : kind === 'bad' ? <Icon name="close" size={12} color={color} strokeWidth={3} />
          : <Text variant="micro" weight={700} style={{ color }}>{kind === 'watch' ? '!' : '–'}</Text>}
    </View>
  );
}

/** Probability as a ring that fills to the share, coloured by level; the percentage sits in the middle. */
export function ProbabilityRing({ probability, color, size = 76, children }: { probability: number; color: string; size?: number; children: ReactNode }) {
  const { track } = useChartColors();
  const stroke = 7;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = clamp(probability, 0, 1) * circumference;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        {filled > 0 && (
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        )}
      </Svg>
      {children}
    </View>
  );
}

/** A labelled share (0–1) as a thin horizontal bar; the value stays in ink, the bar carries the colour. */
export function ShareBar({ label, share, color, value }: { label: string; share: number; color: string; value: string }) {
  const { track } = useChartColors();
  return (
    <View style={{ gap: 6 }} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <Text variant="body-sm" tone="primary-900" style={{ flex: 1 }}>{label}</Text>
        <Text variant="body-sm" weight={700} tone="primary-900">{value}</Text>
      </View>
      <View style={{ height: 6, borderRadius: 99, backgroundColor: track, overflow: 'hidden' }}>
        {share > 0 && <View style={{ width: `${clamp(share, 0.02, 1) * 100}%`, height: 6, borderRadius: 99, backgroundColor: color }} />}
      </View>
    </View>
  );
}

export interface FanPoint {
  label: string;
  median: number;
  low: number;
  high: number;
}

/**
 * Expected cash: the 8-in-10 range as a band, the middle path as a line, and the two-week floor dashed.
 * Tap a month to read its numbers; the last month is shown first.
 */
export function CashFanChart({ start, points, floor, money, startLabel, floorLabel, legend, readout, accessibilityLabel }: {
  start: { label: string; value: number };
  points: FanPoint[];
  floor: number;
  money: (amount: number) => string;
  startLabel: string;
  floorLabel: string;
  legend: { median: string; range: string };
  readout: (point: FanPoint) => string;
  accessibilityLabel: string;
}) {
  const { surface, grid, series } = useChartColors();
  const [width, onLayout] = useWidth();
  const [selected, setSelected] = useState(points.length - 1);
  const height = 150;
  const pad = { top: 12, bottom: 22, left: 6, right: 6 };
  const values = [start.value, floor, 0, ...points.flatMap((p) => [p.low, p.high])];
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  const plotW = Math.max(1, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (i / Math.max(1, points.length)) * plotW;
  const y = (v: number) => pad.top + (1 - (v - low) / span) * plotH;
  const all = [{ label: start.label, median: start.value, low: start.value, high: start.value }, ...points];
  const band = `${all.map((p, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(p.high)}`).join(' ')} ${all.slice().reverse().map((p, j) => `L ${x(all.length - 1 - j)} ${y(p.low)}`).join(' ')} Z`;
  const median = all.map((p, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(p.median)}`).join(' ');
  const current = points[clamp(selected, 0, points.length - 1)];

  return (
    <View style={{ gap: 8 }}>
      {current && (
        <Text variant="caption" tone="primary-900" accessibilityLiveRegion="polite">{readout(current)}</Text>
      )}
      <View onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ height }}>
        {width > 0 && (
          <>
            <Svg width={width} height={height}>
              {low < 0 && <Line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} stroke={grid} strokeWidth={1} />}
              <Path d={band} fill={series} fillOpacity={0.16} />
              <Line x1={pad.left} x2={width - pad.right} y1={y(floor)} y2={y(floor)} stroke={colors.danger} strokeWidth={1.5} strokeDasharray="4 4" />
              <Path d={median} stroke={series} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              {current && <Line x1={x(selected + 1)} x2={x(selected + 1)} y1={pad.top} y2={height - pad.bottom} stroke={grid} strokeWidth={1} />}
              <Circle cx={x(0)} cy={y(start.value)} r={4} fill={surface} stroke={series} strokeWidth={2} />
              {points.map((p, i) => (
                <Circle key={p.label} cx={x(i + 1)} cy={y(p.median)} r={i === selected ? 5.5 : 4.5} fill={p.median < floor ? colors.danger : series} stroke={surface} strokeWidth={2} />
              ))}
            </Svg>
            {/* Direct labels and hit areas as plain views so text uses the app's fonts. */}
            <Text variant="micro" tone="neutral-600" style={{ position: 'absolute', left: pad.left + 2, top: clamp(y(floor) + 3, 0, height - pad.bottom - 16) }}>{floorLabel}</Text>
            {all.map((p, i) => (
              <Text key={p.label} variant="micro" tone={i === selected + 1 ? 'primary-900' : 'neutral-600'} weight={i === selected + 1 ? 600 : undefined}
                style={{ position: 'absolute', bottom: 0, left: clamp(x(i) - 24, 0, width - 48), width: 48, textAlign: i === 0 ? 'left' : i === all.length - 1 ? 'right' : 'center' }}>
                {i === 0 ? startLabel : p.label}
              </Text>
            ))}
            {points.map((p, i) => (
              <Pressable key={p.label} accessibilityRole="button" accessibilityLabel={readout(p)} onPress={() => setSelected(i)}
                style={{ position: 'absolute', top: 0, bottom: 0, left: x(i + 1) - plotW / points.length / 2, width: plotW / points.length }} />
            ))}
          </>
        )}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        <LegendSwatch color={series} label={legend.median} line />
        <LegendSwatch color={series} label={legend.range} faded />
        <LegendSwatch color={colors.danger} label={`${floorLabel} (${money(floor)})`} dashed />
      </View>
    </View>
  );
}

export function LegendSwatch({ color, label, line, faded, dashed }: { color: string; label: string; line?: boolean; faded?: boolean; dashed?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {line || dashed ? (
        <Svg width={14} height={8}>
          <Line x1={1} x2={13} y1={4} y2={4} stroke={color} strokeWidth={2} strokeLinecap="round" strokeDasharray={dashed ? '3 3' : undefined} />
        </Svg>
      ) : (
        <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color, opacity: faded ? 0.3 : 1 }} />
      )}
      <Text variant="micro" tone="neutral-600">{label}</Text>
    </View>
  );
}

export interface DivergingItem {
  key: string;
  label: string;
  detail: string;
  /** Positive pushes right (raises risk), negative pushes left (lowers risk). */
  amount: number;
}

/** Reasons behind a score: bars grow right when they raise the risk and left when they lower it, from a neutral centre. */
export function DivergingBars({ items, leftLabel, rightLabel }: { items: DivergingItem[]; leftLabel: string; rightLabel: string }) {
  const { grid, track } = useChartColors();
  const max = Math.max(...items.map((item) => Math.abs(item.amount)), 1e-9);
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="micro" weight={600} style={{ color: colors.success }}>↓ {leftLabel}</Text>
        <Text variant="micro" weight={600} style={{ color: colors.danger }}>{rightLabel} ↑</Text>
      </View>
      {items.map((item) => {
        const share = Math.abs(item.amount) / max;
        const raises = item.amount > 0;
        return (
          <View key={item.key} style={{ gap: 5 }} accessible accessibilityLabel={`${item.label}: ${item.detail}, ${raises ? rightLabel : leftLabel}`}>
            <Text variant="body-sm" tone="primary-900">{item.label} <Text variant="micro" tone="neutral-600">· {item.detail}</Text></Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', height: 8 }}>
              <View style={{ flex: 1, height: 8, borderRadius: 99, backgroundColor: track, flexDirection: 'row', justifyContent: 'flex-end', overflow: 'hidden', marginRight: 1 }}>
                {!raises && <View style={{ width: `${clamp(share, 0.04, 1) * 100}%`, height: 8, borderRadius: 99, backgroundColor: colors.success }} />}
              </View>
              <View style={{ width: 2, height: 14, borderRadius: 1, backgroundColor: grid }} />
              <View style={{ flex: 1, height: 8, borderRadius: 99, backgroundColor: track, overflow: 'hidden', marginLeft: 1 }}>
                {raises && <View style={{ width: `${clamp(share, 0.04, 1) * 100}%`, height: 8, borderRadius: 99, backgroundColor: colors.danger }} />}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Before → after on a 0–100% scale: a hollow dot for now, a filled dot for after the change, joined by a line. */
export function BeforeAfterBar({ label, before, after, beforeText, afterText }: { label: string; before: number; after: number; beforeText: string; afterText: string }) {
  const { track, muted, surface } = useChartColors();
  const [width, onLayout] = useWidth();
  const height = 16;
  const x = (v: number) => 6 + clamp(v, 0, 1) * Math.max(1, width - 12);
  return (
    <View style={{ gap: 4 }} accessible accessibilityLabel={`${label}: ${beforeText} → ${afterText}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text variant="micro" tone="neutral-600">{label}</Text>
        <Text variant="micro" tone="neutral-600">{beforeText} → <Text variant="micro" weight={700} tone="primary-900">{afterText}</Text></Text>
      </View>
      <View onLayout={onLayout} style={{ height }}>
        {width > 0 && (
          <Svg width={width} height={height}>
            <Line x1={6} x2={width - 6} y1={height / 2} y2={height / 2} stroke={track} strokeWidth={4} strokeLinecap="round" />
            <Line x1={x(before)} x2={x(after)} y1={height / 2} y2={height / 2} stroke={colors.success} strokeWidth={4} strokeLinecap="round" />
            <Circle cx={x(before)} cy={height / 2} r={5} fill={surface} stroke={muted} strokeWidth={2} />
            <Circle cx={x(after)} cy={height / 2} r={5} fill={colors.success} stroke={surface} strokeWidth={2} />
          </Svg>
        )}
      </View>
    </View>
  );
}

export interface StackPart {
  key: string;
  label: string;
  value: number;
  color: string;
  text: string;
}

/** One horizontal bar split into parts, 2px apart, with a legend row carrying each part's value. */
export function StackedBar({ parts, accessibilityLabel }: { parts: StackPart[]; accessibilityLabel: string }) {
  const { track } = useChartColors();
  const total = parts.reduce((sum, part) => sum + Math.max(0, part.value), 0) || 1;
  const shown = parts.filter((part) => part.value > 0);
  return (
    <View style={{ gap: 8 }} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <View style={{ height: 12, flexDirection: 'row', gap: 2, borderRadius: 4, overflow: 'hidden', backgroundColor: shown.length ? undefined : track }}>
        {shown.map((part) => (
          <View key={part.key} style={{ flex: part.value / total, backgroundColor: part.color }} />
        ))}
      </View>
      <View style={{ gap: 4 }}>
        {parts.map((part) => (
          <View key={part.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: part.color }} />
            <Text variant="micro" tone="neutral-600" style={{ flex: 1 }}>{part.label}</Text>
            <Text variant="micro" weight={600} tone="primary-900">{part.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * A traffic-light scale built from a ratio's own thresholds: red, amber and green zones (named underneath),
 * a dot for the business's figure and a labelled tick for the target. The scale zooms on the thresholds,
 * so a figure far outside them sits at the end of the bar instead of squashing the zones.
 */
export function ZoneBar({ value, red, yellow, target, betterWhen, faded, labels, targetLabel, accessibilityLabel }: {
  value: number | null;
  red: number;
  yellow: number;
  target: number;
  betterWhen: 'higher' | 'lower';
  /** Not ready yet: the zones are dimmed and the dot is hollow. */
  faded?: boolean;
  labels: { bad: string; watch: string; good: string };
  targetLabel: string;
  accessibilityLabel: string;
}) {
  const { surface, ink } = useChartColors();
  const [width, onLayout] = useWidth();
  const edges = [red, yellow, target];
  const unit = Math.max(...edges) - Math.min(...edges) || Math.abs(target) || 1;
  let low = Math.min(...edges) - unit * 0.8;
  let high = Math.max(...edges) + unit * 0.8;
  if (value !== null) {
    low = Math.max(Math.min(low, value), Math.min(...edges) - unit * 3);
    high = Math.min(Math.max(high, value), Math.max(...edges) + unit * 3);
  }
  const at = (v: number) => clamp((v - low) / (high - low), 0, 1) * width;
  // Left to right: higher-is-better reads bad → good; lower-is-better reads good → bad.
  const zones = betterWhen === 'higher'
    ? [{ key: 'bad', from: low, to: red, color: colors.danger }, { key: 'watch', from: red, to: yellow, color: colors.warning }, { key: 'good', from: yellow, to: high, color: colors.success }]
    : [{ key: 'good', from: low, to: yellow, color: colors.success }, { key: 'watch', from: yellow, to: red, color: colors.warning }, { key: 'bad', from: red, to: high, color: colors.danger }];
  const BAR = 10;
  const DOT = 16;
  const targetX = at(target);
  return (
    <View onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ gap: 4 }}>
      {width > 0 && (
        <>
          <View style={{ height: 16 }}>
            <Text variant="micro" weight={600} tone="primary-900" numberOfLines={1}
              style={{ position: 'absolute', width: 120, left: clamp(targetX - 60, 0, width - 120), textAlign: targetX < 60 ? 'left' : targetX > width - 60 ? 'right' : 'center' }}>
              {targetLabel}
            </Text>
          </View>
          <View style={{ height: DOT, justifyContent: 'center' }}>
            <View style={{ height: BAR, flexDirection: 'row', gap: 2, opacity: faded ? 0.35 : 1 }}>
              {zones.map((zone, i) => (
                <View key={zone.key} style={{
                  width: Math.max(0, at(zone.to) - at(zone.from) - (i < 2 ? 2 : 0)), backgroundColor: zone.color,
                  borderTopLeftRadius: i === 0 ? 5 : 0, borderBottomLeftRadius: i === 0 ? 5 : 0, borderTopRightRadius: i === 2 ? 5 : 0, borderBottomRightRadius: i === 2 ? 5 : 0,
                }} />
              ))}
            </View>
            <View style={{ position: 'absolute', left: targetX - 1, top: -3, width: 2, height: DOT + 6, borderRadius: 1, backgroundColor: ink }} />
            {value !== null && (
              <View style={{
                position: 'absolute', left: clamp(at(value) - DOT / 2, 0, width - DOT), width: DOT, height: DOT, borderRadius: DOT / 2,
                borderWidth: 3, borderColor: faded ? ink : surface, backgroundColor: faded ? surface : ink,
              }} />
            )}
          </View>
          <View style={{ height: 16 }}>
            {zones.map((zone) => {
              const middle = (at(zone.from) + at(zone.to)) / 2;
              return (
                <Text key={zone.key} variant="micro" tone="neutral-600" numberOfLines={1}
                  style={{ position: 'absolute', width: 80, left: clamp(middle - 40, 0, width - 80), textAlign: 'center' }}>
                  {labels[zone.key as keyof typeof labels]}
                </Text>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

/** A value against a target on one scale: the fill is the value, the dark tick is the target. */
export function TargetMeter({ value, target, max, color }: { value: number; target: number; max: number; color: string }) {
  const { dark, track } = useChartColors();
  const position = (v: number) => `${clamp(v / (max || 1), 0, 1) * 100}%` as const;
  return (
    <View style={{ height: 8, borderRadius: 999, backgroundColor: track, position: 'relative' }}>
      {value > 0 && <View style={{ width: position(value), height: 8, borderRadius: 999, backgroundColor: color }} />}
      <View style={{ position: 'absolute', left: position(target), top: -3, height: 14, width: 2, marginLeft: -1, borderRadius: 1, backgroundColor: dark ? colors.dark.text : colors.primary[900] }} />
    </View>
  );
}

/**
 * A ratio over the past months: a 2px line, the target dashed, the latest month marked.
 * Gaps (months without the figure) break the line instead of being drawn as zero.
 */
export function Sparkline({ values, target, height = 36 }: { values: (number | null)[]; target: number; height?: number }) {
  const { surface, series, muted } = useChartColors();
  const [width, onLayout] = useWidth();
  const known = values.filter((v): v is number => v !== null);
  const low = Math.min(target, ...known);
  const high = Math.max(target, ...known);
  const span = high - low || Math.abs(high) || 1;
  const pad = 5;
  const x = (i: number) => pad + (i / Math.max(1, values.length - 1)) * Math.max(1, width - pad * 2);
  const y = (v: number) => pad + (1 - (v - low) / span) * (height - pad * 2);
  let d = '';
  values.forEach((v, i) => {
    if (v === null) return;
    d += `${i > 0 && values[i - 1] !== null ? 'L' : 'M'} ${x(i)} ${y(v)} `;
  });
  const lastIndex = values.map((v) => v !== null).lastIndexOf(true);
  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Line x1={pad} x2={width - pad} y1={y(target)} y2={y(target)} stroke={muted} strokeOpacity={0.6} strokeWidth={1.5} strokeDasharray="3 3" />
          {values.map((v, i) => v !== null && (i === 0 || values[i - 1] === null) && (i === values.length - 1 || values[i + 1] === null)
            ? <Circle key={i} cx={x(i)} cy={y(v)} r={2} fill={series} /> : null)}
          <Path d={d} stroke={series} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {lastIndex >= 0 && <Circle cx={x(lastIndex)} cy={y(values[lastIndex] as number)} r={4} fill={series} stroke={surface} strokeWidth={2} />}
        </Svg>
      )}
    </View>
  );
}

export interface StatusColumn {
  label: string;
  green: number;
  yellow: number;
  red: number;
}

const STATUS_PARTS = [
  { key: 'red', color: colors.danger },
  { key: 'yellow', color: colors.warning },
  { key: 'green', color: colors.success },
] as const;

/** Healthy / watch / at-risk counts per month as stacked columns (at risk on top); tap a month to read it. */
export function StatusColumns({ columns, readout, accessibilityLabel }: { columns: StatusColumn[]; readout: (column: StatusColumn) => string; accessibilityLabel: string }) {
  const { track } = useChartColors();
  const [selected, setSelected] = useState(columns.length - 1);
  const max = Math.max(1, ...columns.map((c) => c.green + c.yellow + c.red));
  const plotH = 64;
  const current = columns[clamp(selected, 0, columns.length - 1)];
  return (
    <View style={{ gap: 8 }}>
      {current && <Text variant="micro" tone="primary-900" accessibilityLiveRegion="polite">{readout(current)}</Text>}
      <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ flexDirection: 'row', gap: 6 }}>
        {columns.map((column, i) => {
          const total = column.green + column.yellow + column.red;
          const active = i === selected;
          return (
            <Pressable key={column.label} onPress={() => setSelected(i)} accessibilityRole="button" accessibilityLabel={readout(column)} accessibilityState={{ selected: active }}
              style={{ flex: 1, alignItems: 'center', gap: 5 }}>
              <View style={{ height: plotH, width: '100%', maxWidth: 22, justifyContent: 'flex-end', gap: 2, opacity: active ? 1 : 0.55 }}>
                {total === 0
                  ? <View style={{ height: 3, borderRadius: 3, backgroundColor: track }} />
                  : STATUS_PARTS.map((part) => column[part.key] > 0 && (
                    <View key={part.key} style={{ height: Math.max(3, (column[part.key] / max) * plotH - 2), borderRadius: 3, backgroundColor: part.color }} />
                  ))}
              </View>
              <Text variant="micro" tone={active ? 'primary-900' : 'neutral-600'} weight={active ? 600 : undefined} numberOfLines={1}>{column.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
