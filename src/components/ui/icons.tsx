import type { SVGProps } from 'react';

/** Decorative inline icons. They are always paired with text, so they are hidden from assistive tech. */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      {children}
    </svg>
  );
}

export const LogoMark = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
    <rect x="1" y="1" width="18" height="18" rx="5" fill="var(--color-brand)" />
    <circle cx="9" cy="9" r="4" fill="none" stroke="#fff" strokeWidth="1.8" />
    <path d="M12 12l3.2 3.2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const IconArrowUp = (p: IconProps) => <Svg {...p}><path d="M8 13V3M4 7l4-4 4 4" /></Svg>;
export const IconArrowDown = (p: IconProps) => <Svg {...p}><path d="M8 3v10M4 9l4 4 4-4" /></Svg>;
export const IconArrowRight = (p: IconProps) => <Svg {...p}><path d="M3 8h10M9 4l4 4-4 4" /></Svg>;
export const IconAlert = (p: IconProps) => <Svg {...p}><path d="M8 2.5l6 10.5H2L8 2.5zM8 6.5v3M8 11.3v.2" /></Svg>;
export const IconInfo = (p: IconProps) => <Svg {...p}><circle cx="8" cy="8" r="6" /><path d="M8 7.2V11M8 5v.2" /></Svg>;
export const IconCheck = (p: IconProps) => <Svg {...p}><path d="M3 8.5l3.2 3L13 4.5" /></Svg>;
export const IconClose = (p: IconProps) => <Svg {...p}><path d="M4 4l8 8M12 4l-8 8" /></Svg>;
export const IconPlus = (p: IconProps) => <Svg {...p}><path d="M8 3v10M3 8h10" /></Svg>;
export const IconSearch = (p: IconProps) => <Svg {...p}><circle cx="7" cy="7" r="4.2" /><path d="M10.2 10.2L13.5 13.5" /></Svg>;
export const IconDownload = (p: IconProps) => <Svg {...p}><path d="M8 2.5v8M4.5 7.5L8 11l3.5-3.5M3 13.5h10" /></Svg>;
export const IconUpload = (p: IconProps) => <Svg {...p}><path d="M8 11V3M4.5 6L8 2.5 11.5 6M3 13.5h10" /></Svg>;
export const IconLink = (p: IconProps) => <Svg {...p}><path d="M6.8 9.2a2.6 2.6 0 003.7 0l2-2a2.6 2.6 0 00-3.7-3.7l-.7.7M9.2 6.8a2.6 2.6 0 00-3.7 0l-2 2a2.6 2.6 0 003.7 3.7l.7-.7" /></Svg>;
export const IconLock = (p: IconProps) => <Svg {...p}><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 015 0v2" /></Svg>;
export const IconMinus = (p: IconProps) => <Svg {...p}><path d="M3.5 8h9" /></Svg>;
export const IconSort = (p: IconProps) => <Svg {...p}><path d="M5 6l3-3 3 3M5 10l3 3 3-3" /></Svg>;
