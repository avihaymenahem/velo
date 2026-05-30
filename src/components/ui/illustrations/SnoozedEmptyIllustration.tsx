interface Props {
  size?: number;
  className?: string;
}

export function SnoozedEmptyIllustration({ size = 140, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 140 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <mask id="snoozed-moon-mask">
          <rect width="140" height="140" fill="white" />
          <circle cx="104" cy="34" r="16" fill="black" />
        </mask>
      </defs>
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
      {/* Crescent moon (mask cuts a bite out of the circle) */}
      <circle
        cx="97"
        cy="40"
        r="20"
        fill="var(--color-accent)"
        opacity="0.65"
        mask="url(#snoozed-moon-mask)"
      />
      {/* Moon subtle ring */}
      <circle
        cx="97"
        cy="40"
        r="20"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1"
        opacity="0.2"
      />
      {/* Zzz — three Z shapes ascending in size (bottom to top) */}
      <path
        d="M104 48 L112 48 L104 56 L112 56"
        stroke="var(--color-accent)"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
      <path
        d="M112 37 L119 37 L112 44 L119 44"
        stroke="var(--color-accent)"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.5"
      />
      <path
        d="M118 26 L124 26 L118 31 L124 31"
        stroke="var(--color-accent)"
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.33"
      />
      {/* Sparkles */}
      <circle cx="30" cy="40" r="2.5" fill="var(--color-accent)" opacity="0.3" />
      <circle cx="42" cy="30" r="1.5" fill="var(--color-accent)" opacity="0.22" />
      <circle cx="20" cy="28" r="2" fill="var(--color-accent)" opacity="0.18" />
    </svg>
  );
}
