interface Props {
  size?: number;
  className?: string;
}

export function UnreadEmptyIllustration({ size = 140, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 140 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Outer glow rings */}
      <circle cx="70" cy="54" r="36" fill="var(--color-accent)" opacity="0.06" />
      <circle cx="70" cy="54" r="28" fill="var(--color-accent)" opacity="0.10" />
      {/* Badge circle */}
      <circle
        cx="70"
        cy="54"
        r="22"
        fill="var(--color-accent)"
        opacity="0.18"
      />
      <circle
        cx="70"
        cy="54"
        r="22"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1.5"
        opacity="0.55"
      />
      {/* Bold checkmark inside badge */}
      <path
        d="M60,54 L67,62 L81,44"
        stroke="var(--color-accent)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Closed envelope (secondary, below badge) */}
      <rect
        x="38"
        y="88"
        width="64"
        height="36"
        rx="5"
        fill="var(--color-bg-tertiary)"
        stroke="var(--color-border-primary)"
        strokeWidth="1.5"
      />
      {/* Sealed flap */}
      <path
        d="M38 94 L70 109 L102 94"
        stroke="var(--color-border-primary)"
        strokeWidth="1.5"
        fill="none"
        strokeLinejoin="round"
      />
      {/* Sparkles */}
      <circle cx="28" cy="28" r="2.5" fill="var(--color-accent)" opacity="0.35" />
      <circle cx="108" cy="22" r="2" fill="var(--color-accent)" opacity="0.28" />
      <circle cx="20" cy="48" r="1.5" fill="var(--color-accent)" opacity="0.22" />
      <circle cx="118" cy="50" r="1.5" fill="var(--color-accent)" opacity="0.18" />
      <circle cx="110" cy="108" r="2" fill="var(--color-accent)" opacity="0.15" />
    </svg>
  );
}
