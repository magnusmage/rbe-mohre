import type { ReactNode, SVGProps } from 'react';

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'stroke'> {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

function createIcon(paths: ReactNode, defaultStrokeWidth = 2) {
  return function Icon({ size = 16, color = 'currentColor', strokeWidth = defaultStrokeWidth, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        aria-hidden="true"
        {...rest}
      >
        {paths}
      </svg>
    );
  };
}

export const GlobeIcon = createIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
  </>,
);

export const ChevronDownIcon = createIcon(<path d="M6 9l6 6 6-6" />);

export const ChevronLeftIcon = createIcon(<path d="M15 18l-6-6 6-6" />);

export const CheckIcon = createIcon(<path d="M20 6L9 17l-5-5" />, 2.5);

export const PhoneIcon = createIcon(
  <path d="M22 16.92v3a2 2 0 01-2.18 2A19.79 19.79 0 013.09 4.18 2 2 0 015.08 2h3a2 2 0 012 1.72c.13.96.37 1.9.72 2.81a2 2 0 01-.45 2.11L9.09 10.09a16 16 0 006 6l1.45-1.27a2 2 0 012.11-.45c.9.35 1.85.59 2.81.72A2 2 0 0122 16.92z" />,
);

export const PhoneOffIcon = createIcon(
  <>
    <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7 2 2 0 011.72 2v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 013.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L7.09 9.91" />
    <line x1="23" y1="1" x2="1" y2="23" />
  </>,
);

export const MicIcon = createIcon(
  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4" />,
);

export const MicOffIcon = createIcon(
  <>
    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </>,
);

export const UserIcon = createIcon(
  <>
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </>,
);

export const ListIcon = createIcon(<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />);

export const CopyIcon = createIcon(
  <>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </>,
);

export const SearchIcon = createIcon(
  <>
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </>,
);

export const LockIcon = createIcon(
  <>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </>,
);

export const AlertTriangleIcon = createIcon(
  <>
    <path d="M12 2l10 20H2L12 2z" />
    <path d="M12 9v5M12 18h.01" />
  </>,
);

export const DocumentIcon = createIcon(
  <>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M9 9h6M9 13h6M9 17h4" />
  </>,
);

export const CheckCircleIcon = createIcon(
  <>
    <path d="M9 12l2 2 4-4" />
    <circle cx="12" cy="12" r="10" />
  </>,
);
