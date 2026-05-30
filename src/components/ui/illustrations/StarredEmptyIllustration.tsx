interface Props {
  size?: number;
  className?: string;
}

export function StarredEmptyIllustration({ size = 140, className }: Props) {
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
      {/* Star outer glow */}
      <circle cx="97" cy="40" r="27" fill="var(--color-accent)" opacity="0.07" />
      <circle cx="97" cy="40" r="20" fill="var(--color-accent)" opacity="0.11" />
      {/* 5-pointed star — center (97,40), R_outer=21, R_inner=8.5 */}
      <polygon
        points="97,19 102,33 117,33.5 105,42.5 109,57 97,48.5 85,57 89,42.5 77,33.5 92,33"
        fill="var(--color-accent)"
        opacity="0.72"
      />
      <polygon
        points="97,19 102,33 117,33.5 105,42.5 109,57 97,48.5 85,57 89,42.5 77,33.5 92,33"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1"
        strokeLinejoin="round"
        opacity="0.4"
      />
      {/* Sparkles */}
      <circle cx="30" cy="40" r="2.5" fill="var(--color-accent)" opacity="0.3" />
      <circle cx="42" cy="30" r="1.5" fill="var(--color-accent)" opacity="0.22" />
      <circle cx="20" cy="28" r="2" fill="var(--color-accent)" opacity="0.18" />
      <circle cx="115" cy="74" r="1.5" fill="var(--color-accent)" opacity="0.18" />
      <circle cx="108" cy="102" r="2" fill="var(--color-accent)" opacity="0.15" />
    </svg>
  );
}
