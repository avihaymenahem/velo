interface Props {
  size?: number;
  className?: string;
}

export function ScheduledEmptyIllustration({ size = 140, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 140 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Envelope body */}
      <rect
        x="22"
        y="52"
        width="80"
        height="52"
        rx="6"
        fill="var(--color-bg-tertiary)"
        stroke="var(--color-border-primary)"
        strokeWidth="1.5"
      />
      {/* Envelope flap */}
      <path
        d="M22 58 L62 80 L102 58"
        stroke="var(--color-border-primary)"
        strokeWidth="1.5"
        fill="none"
        strokeLinejoin="round"
      />
      {/* Clock circle */}
      <circle
        cx="96"
        cy="88"
        r="22"
        fill="var(--color-bg-primary)"
        stroke="var(--color-border-primary)"
        strokeWidth="1.5"
      />
      <circle
        cx="96"
        cy="88"
        r="18"
        fill="var(--color-bg-secondary)"
      />
      {/* Clock accent ring */}
      <circle
        cx="96"
        cy="88"
        r="18"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1"
        opacity="0.3"
      />
      {/* Clock center dot */}
      <circle cx="96" cy="88" r="2" fill="var(--color-accent)" opacity="0.8" />
      {/* Hour hand (pointing ~10 o'clock) */}
      <line
        x1="96"
        y1="88"
        x2="88"
        y2="79"
        stroke="var(--color-text-primary)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.7"
      />
      {/* Minute hand (pointing ~2 o'clock) */}
      <line
        x1="96"
        y1="88"
        x2="104"
        y2="78"
        stroke="var(--color-accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Clock tick marks */}
      <line x1="96" y1="71" x2="96" y2="74" stroke="var(--color-border-primary)" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <line x1="96" y1="102" x2="96" y2="105" stroke="var(--color-border-primary)" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <line x1="79" y1="88" x2="82" y2="88" stroke="var(--color-border-primary)" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <line x1="110" y1="88" x2="113" y2="88" stroke="var(--color-border-primary)" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      {/* Sparkles */}
      <circle cx="30" cy="40" r="2.5" fill="var(--color-accent)" opacity="0.4" />
      <circle cx="42" cy="32" r="1.5" fill="var(--color-accent)" opacity="0.3" />
      <circle cx="70" cy="38" r="2" fill="var(--color-accent)" opacity="0.25" />
      <circle cx="56" cy="44" r="1.5" fill="var(--color-accent)" opacity="0.2" />
    </svg>
  );
}
