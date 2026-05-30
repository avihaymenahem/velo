interface Props {
  size?: number;
  className?: string;
}

export function DraftsEmptyIllustration({ size = 140, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 140 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Document body */}
      <rect
        x="28"
        y="28"
        width="72"
        height="90"
        rx="6"
        fill="var(--color-bg-tertiary)"
        stroke="var(--color-border-primary)"
        strokeWidth="1.5"
      />
      {/* Folded corner (dog-ear) */}
      <path
        d="M80 28 L100 48 L80 48 Z"
        fill="var(--color-bg-secondary)"
        stroke="var(--color-border-primary)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Text lines */}
      <line x1="42" y1="64" x2="84" y2="64" stroke="var(--color-border-primary)" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <line x1="42" y1="76" x2="78" y2="76" stroke="var(--color-border-primary)" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
      <line x1="42" y1="88" x2="82" y2="88" stroke="var(--color-border-primary)" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
      <line x1="42" y1="100" x2="64" y2="100" stroke="var(--color-border-primary)" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
      {/* Pencil (rotated ~-40°, tip pointing bottom-left) */}
      <g transform="rotate(-40 108 98)">
        {/* Pencil eraser */}
        <rect x="103" y="70" width="10" height="8" rx="2" fill="var(--color-accent)" opacity="0.5" stroke="var(--color-border-primary)" strokeWidth="1.2" />
        {/* Pencil ferrule */}
        <rect x="103" y="78" width="10" height="4" fill="var(--color-accent)" opacity="0.25" />
        {/* Pencil shaft */}
        <rect x="103" y="82" width="10" height="28" rx="1" fill="var(--color-bg-secondary)" stroke="var(--color-border-primary)" strokeWidth="1.2" />
        {/* Pencil tip */}
        <path d="M103 110 L108 120 L113 110 Z" fill="var(--color-text-primary)" opacity="0.45" />
      </g>
      {/* Sparkles */}
      <circle cx="118" cy="36" r="2.5" fill="var(--color-accent)" opacity="0.3" />
      <circle cx="20" cy="55" r="2" fill="var(--color-accent)" opacity="0.25" />
      <circle cx="18" cy="78" r="1.5" fill="var(--color-accent)" opacity="0.18" />
      <circle cx="120" cy="60" r="1.5" fill="var(--color-accent)" opacity="0.15" />
    </svg>
  );
}
