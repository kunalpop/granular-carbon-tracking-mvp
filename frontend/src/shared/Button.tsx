import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
};

export default function Button({
  children,
  className = "",
  variant = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  const variantClass = variant === "secondary" ? " secondary" : "";

  return (
    <button
      type={type}
      className={`button${variantClass}${
        className ? ` ${className}` : ""
      }`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
