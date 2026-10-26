import Svg, { Path, Rect } from 'react-native-svg';
import { flagColors as f } from '@/theme/flags';

/** Cambodia flag (blue / red / blue with a simplified temple), 60 px circular crop by the parent. */
export function CambodiaFlag({ size = 60 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 60 60">
      <Rect width="60" height="60" fill={f.khBlue} />
      <Rect y="15" width="60" height="30" fill={f.khRed} />
      <Path d="M18 36 h24 v-3 h-2 v-4 h-3 v-5 h-2 v-3 h-2 v-3 h-4 v3 h-2 v3 h-2 v5 h-3 v4 h-2 z" fill={f.khWhite} />
    </Svg>
  );
}

/** UK flag (Union Jack). */
export function UkFlag({ size = 60 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 60 60">
      <Rect width="60" height="60" fill={f.ukBlue} />
      <Path d="M0 0 L60 60 M60 0 L0 60" stroke={f.ukWhite} strokeWidth="9" />
      <Path d="M0 0 L60 60 M60 0 L0 60" stroke={f.ukRed} strokeWidth="3.5" />
      <Path d="M30 0 V60 M0 30 H60" stroke={f.ukWhite} strokeWidth="15" />
      <Path d="M30 0 V60 M0 30 H60" stroke={f.ukRed} strokeWidth="8" />
    </Svg>
  );
}
