import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '@/theme';

/** Line icons lifted from the Dynkle terminal design (24×24, round caps). */
const ICONS = {
  arrowRight: <Path d="M5 12h14M13 6l6 6-6 6" />,
  back: <Path d="M15 5l-7 7 7 7" />,
  chevron: <Path d="M9 5l7 7-7 7" />,
  check: <Path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <Path d="M6 6l12 12M18 6L6 18" />,
  plus: <Path d="M12 5v14M5 12h14" />,
  minus: <Path d="M5 12h14" />,
  tap: <Path d="M8 8a6 6 0 0 1 0 8M12 5a10 10 0 0 1 0 14M16 2.5a14 14 0 0 1 0 19" />,
  tapOff: (
    <>
      <Path d="M8 8a6 6 0 0 1 0 8M12 5a10 10 0 0 1 0 14M16 2.5a14 14 0 0 1 0 19" />
      <Path d="M3 3l18 18" />
    </>
  ),
  scan: (
    <>
      <Rect x="3" y="3" width="7" height="7" />
      <Rect x="14" y="3" width="7" height="7" />
      <Rect x="3" y="14" width="7" height="7" />
      <Path d="M14 14h3v3M21 14v7h-7" />
    </>
  ),
  bluetooth: <Path d="M7 7l10 10-5 4V3l5 4L7 17" />,
  wifi: (
    <>
      <Path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" />
      <Circle cx="12" cy="19.5" r="1" fill="currentColor" />
    </>
  ),
  wifi2: <Path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" />,
  wifi1: <Path d="M8.5 16a5 5 0 0 1 7 0" />,
  wifiOff: (
    <>
      <Path d="M3 3l18 18" />
      <Path d="M8.5 16a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 5-2.7M14.5 9.9a10 10 0 0 1 4.5 2.6M2 9a15 15 0 0 1 4.5-2.9M11 5.1A15 15 0 0 1 22 9" />
    </>
  ),
  sim: (
    <>
      <Path d="M6 3h8l4 4v14H6z" />
      <Rect x="9" y="11" width="6" height="6" rx="1" />
    </>
  ),
  lock: (
    <>
      <Rect x="5" y="11" width="14" height="10" rx="2" />
      <Path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  unlock: (
    <>
      <Rect x="5" y="11" width="14" height="10" rx="2" />
      <Path d="M8 11V7a4 4 0 0 1 8-1" />
    </>
  ),
  settings: (
    <>
      <Path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
      <Circle cx="16" cy="6" r="2" />
      <Circle cx="10" cy="12" r="2" />
      <Circle cx="18" cy="18" r="2" />
    </>
  ),
  backspace: (
    <>
      <Path d="M21 5H9l-6 7 6 7h12z" />
      <Path d="M12 9l6 6M18 9l-6 6" />
    </>
  ),
  keypad: (
    <>
      {[5, 11, 17].flatMap((cy) =>
        [6, 12, 18].map((cx) => <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.3" />),
      )}
    </>
  ),
  items: (
    <>
      <Rect x="3" y="3" width="7" height="7" rx="1.5" />
      <Rect x="14" y="3" width="7" height="7" rx="1.5" />
      <Rect x="3" y="14" width="7" height="7" rx="1.5" />
      <Rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  activity: (
    <>
      <Path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" />
      <Path d="M9 8h6M9 12h6" />
    </>
  ),
  tag: (
    <>
      <Path d="M20 12l-8 8-9-9V3h8z" />
      <Circle cx="7.5" cy="7.5" r="1.2" />
    </>
  ),
  monitor: (
    <>
      <Rect x="3" y="4" width="18" height="12" rx="2" />
      <Path d="M8 20h8M12 16v4" />
    </>
  ),
  clock: (
    <>
      <Circle cx="12" cy="12" r="8" />
      <Path d="M12 8v4l3 2" />
    </>
  ),
  restart: <Path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" />,
  download: <Path d="M12 3v12M7 10l5 5 5-5M5 21h14" />,
  unlink: <Path d="M9 15l-3 3a3 3 0 0 1-4-4l3-3M15 9l3-3a3 3 0 0 1 4 4l-3 3M4 4l16 16" />,
  trash: <Path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15" />,
  warning: <Path d="M12 3l10 18H2zM12 10v5M12 18h0" />,
  edit: <Path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" />,
  help: (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h0" />
    </>
  ),
  server: (
    <>
      <Rect x="3" y="4" width="18" height="7" rx="2" />
      <Rect x="3" y="13" width="18" height="7" rx="2" />
      <Path d="M7 7.5h0M7 16.5h0" />
    </>
  ),
  menu: <Path d="M4 7h16M4 12h16M4 17h10" />,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 22,
  color = colors.ink,
  strokeWidth = 2.2,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      color={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name]}
    </Svg>
  );
}
