import {
  ArrowDownUp,
  ArrowLeft,
  Banknote,
  Bell,
  BookOpen,
  Bus,
  Calendar,
  Car,
  ChartColumnBig,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CircleQuestionMark,
  CircleUserRound,
  Coins,
  Download,
  Eye,
  EyeOff,
  FileText,
  Gem,
  Gift,
  Headset,
  House,
  Info,
  KeyRound,
  Layers,
  Lock,
  LogOut,
  Mail,
  NotebookPen,
  PencilLine,
  Phone,
  Pill,
  Plane,
  Plus,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBasket,
  SquareArrowDownRight,
  SquareArrowUpRight,
  Square,
  SquareCheck,
  Star,
  Tag,
  Ticket,
  Upload,
  User,
  Utensils,
  WifiOff,
  X,
} from 'lucide-react-native';
import type { ComponentType } from 'react';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { colors } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

type LucideLike = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const LIBRARY = {
  home: House,
  bell: Bell,
  back: ArrowLeft,
  income: SquareArrowUpRight,
  expense: SquareArrowDownRight,
  pencil: PencilLine,
  layers: Layers,
  user: User,
  search: Search,
  calendar: Calendar,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  check: Check,
  checkSquare: SquareCheck,
  square: Square,
  info: Info,
  plus: Plus,
  download: Download,
  close: X,
  swap: ArrowDownUp,
  eye: Eye,
  eyeOff: EyeOff,
  wifiOff: WifiOff,
  star: Star,
  dollar: CircleDollarSign,
  settings: Settings,
  shield: ShieldCheck,
  help: Headset,
  helpCircle: CircleQuestionMark,
  logout: LogOut,
  file: FileText,
  upload: Upload,
  book: BookOpen,
  tag: Tag,
  // bottom navigation
  chart: ChartColumnBig,
  notebook: NotebookPen,
  receipt: ReceiptText,
  account: CircleUserRound,
  // category icons (stored by key in categories.icon)
  salary: Banknote,
  groceries: ShoppingBasket,
  rent: KeyRound,
  transport: Bus,
  food: Utensils,
  car: Car,
  travel: Plane,
  house: House,
  gifts: Gift,
  medicine: Pill,
  entertainment: Ticket,
  savings: Coins,
  wedding: Gem,
  more: Plus,
  // sign-in and sign-up fields
  mail: Mail,
  lock: Lock,
  phone: Phone,
} satisfies Record<string, LucideLike>;

export type IconName = keyof typeof LIBRARY | 'analysis';

interface Props {
  name: IconName | (string & {});
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/** Magnifier over a bar chart: the Analysis tab icon, which Lucide has no match for. */
function AnalysisIcon({ size = 24, color = colors.primary[900], strokeWidth = 1.5 }: Omit<Props, 'name'>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="10.5" cy="10.5" r="8" />
      <Line x1="16.5" y1="16.5" x2="21.5" y2="21.5" />
      <Rect x="6.5" y="11" width="1.6" height="4" />
      <Rect x="9.7" y="7.5" width="1.6" height="7.5" />
      <Rect x="12.9" y="9.5" width="1.6" height="5.5" />
    </Svg>
  );
}

export function Icon({ name, size = 24, color, strokeWidth = 1.75 }: Props) {
  const dark = useAppTheme();
  const iconColor = color ?? (dark ? colors.dark.primary : colors.primary[900]);
  if (name === 'analysis') return <AnalysisIcon size={size} color={iconColor} strokeWidth={strokeWidth} />;
  const Cmp = (LIBRARY as Record<string, LucideLike>)[name] ?? LIBRARY.more;
  return <Cmp size={size} color={iconColor} strokeWidth={strokeWidth} />;
}
