interface Props {
  size?: number;
  className?: string;
}

export function StarredRecentIllustration({ size = 140, className }: Props) {
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
      {/* Small star top-right — center (100,36), R_outer=15, R_inner=6 */}
      <circle cx="100" cy="36" r="19" fill="var(--color-accent)" opacity="0.08" />
      <polygon
        points="100,21 103.4,31.5 114.3,31.8 106,38.1 108.9,48.8 100,42.5 91.1,48.8 94,38.1 85.7,31.8 96.6,31.5"
        fill="var(--color-accent)"
        opacity="0.68"
      />
      <polygon
        points="100,21 103.4,31.5 114.3,31.8 106,38.1 108.9,48.8 100,42.5 91.1,48.8 94,38.1 85.7,31.8 96.6,31.5"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1"
        strokeLinejoin="round"
        opacity="0.35"
      />
      {/* Week calendar card — bottom right, extends slightly outside envelope */}
      <rect
        x="76"
        y="77"
        width="40"
        height="32"
        rx="5"
        fill="var(--color-bg-primary)"
        stroke="var(--color-border-primary)"
        strokeWidth="1.5"
      />
      <rect
        x="77"
        y="78"
        width="38"
        height="30"
        rx="4"
        fill="var(--color-bg-secondary)"
      />
      {/* Card accent ring */}
      <rect
        x="77"
        y="78"
        width="38"
        height="30"
        rx="4"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1"
        opacity="0.2"
      />
      {/* Star inside card — center (96,88), R_outer=8, R_inner=3.2 */}
      <circle cx="96" cy="88" r="11" fill="var(--color-accent)" opacity="0.1" />
      <polygon
        points="96,80 97.9,85.8 103.9,85.9 99.2,89.3 100.9,95.1 96,91.6 91.1,95.1 92.8,89.3 88.1,85.9 94.1,85.8"
        fill="var(--color-accent)"
        opacity="0.65"
      />
      {/* 7 day dots row — Mon to Sun, centered in card at y=103 */}
      {/* Centers at x: 84,88,92,96,100,104,108 — gap 4px, r=1.5 */}
      <circle cx="84" cy="103" r="1.5" fill="var(--color-border-primary)" opacity="0.5" />
      <circle cx="88" cy="103" r="1.5" fill="var(--color-accent)" opacity="0.75" />
      <circle cx="92" cy="103" r="1.5" fill="var(--color-border-primary)" opacity="0.5" />
      <circle cx="96" cy="103" r="1.5" fill="var(--color-accent)" opacity="0.75" />
      <circle cx="100" cy="103" r="1.5" fill="var(--color-border-primary)" opacity="0.5" />
      <circle cx="104" cy="103" r="1.5" fill="var(--color-border-primary)" opacity="0.5" />
      <circle cx="108" cy="103" r="1.5" fill="var(--color-accent)" opacity="0.55" />
      {/* Sparkles */}
      <circle cx="30" cy="40" r="2.5" fill="var(--color-accent)" opacity="0.3" />
      <circle cx="42" cy="30" r="1.5" fill="var(--color-accent)" opacity="0.22" />
      <circle cx="20" cy="28" r="2" fill="var(--color-accent)" opacity="0.18" />
    </svg>
  );
}
