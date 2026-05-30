interface Props {
  size?: number;
  className?: string;
}

export function TasksEmptyIllustration({ size = 140, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 140 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Clipboard body */}
      <rect
        x="30"
        y="38"
        width="80"
        height="86"
        rx="6"
        fill="var(--color-bg-tertiary)"
        stroke="var(--color-border-primary)"
        strokeWidth="1.5"
      />
      {/* Clipboard clip */}
      <rect
        x="50"
        y="30"
        width="40"
        height="18"
        rx="5"
        fill="var(--color-bg-secondary)"
        stroke="var(--color-border-primary)"
        strokeWidth="1.5"
      />
      <rect x="58" y="35" width="24" height="7" rx="3.5" fill="var(--color-bg-primary)" />
      {/* Row 1: checkmark + line */}
      <path
        d="M46 66 L52 72 L64 60"
        stroke="var(--color-accent)"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="72"
        y1="66"
        x2="100"
        y2="66"
        stroke="var(--color-border-primary)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.6"
      />
      {/* Row 2: checkmark + line (slightly faded) */}
      <path
        d="M46 86 L52 92 L64 80"
        stroke="var(--color-accent)"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.6"
      />
      <line
        x1="72"
        y1="86"
        x2="94"
        y2="86"
        stroke="var(--color-border-primary)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.5"
      />
      {/* Row 3: empty circle (no pending tasks) */}
      <circle
        cx="55"
        cy="106"
        r="5"
        fill="none"
        stroke="var(--color-border-primary)"
        strokeWidth="1.5"
        opacity="0.3"
      />
      <line
        x1="72"
        y1="106"
        x2="86"
        y2="106"
        stroke="var(--color-border-primary)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.22"
      />
      {/* Sparkles */}
      <circle cx="22" cy="65" r="2.5" fill="var(--color-accent)" opacity="0.25" />
      <circle cx="118" cy="55" r="2" fill="var(--color-accent)" opacity="0.2" />
      <circle cx="25" cy="88" r="1.5" fill="var(--color-accent)" opacity="0.15" />
      <circle cx="116" cy="80" r="1.5" fill="var(--color-accent)" opacity="0.12" />
    </svg>
  );
}
