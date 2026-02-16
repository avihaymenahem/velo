import { type ButtonHTMLAttributes, type ReactNode, type Ref } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "xs" | "sm" | "md";
  icon?: ReactNode;
  iconOnly?: boolean;
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = "secondary",
  size = "sm",
  icon,
  iconOnly = false,
  children,
  className = "",
  disabled,
  ref,
  ...rest
}: ButtonProps) {
  const base = "inline-flex items-center justify-center font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  const variants = {
    primary: "text-white bg-accent hover:bg-accent-hover",
    secondary: "text-text-secondary hover:text-text-primary hover:bg-bg-hover",
    ghost: "text-text-tertiary hover:text-text-primary hover:bg-bg-hover",
    danger: "text-white bg-danger hover:bg-red-700",
  };

  const sizes = iconOnly
    ? { xs: "p-1", sm: "p-1.5", md: "p-2" }
    : { xs: "px-2 py-1 text-xs gap-1", sm: "px-3 py-1.5 text-xs gap-1.5", md: "px-4 py-2 text-sm gap-2" };

  return (
    <button
      ref={ref}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
