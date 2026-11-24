import React from "react";

export type BadgeVariant =
  | "success"
  | "warning"
  | "error"
  | "info"
  | "neutral"
  | "burgundy";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  icon?: React.ReactNode;
  className?: string;
  size?: "sm" | "md";
}

export function Badge({
  children,
  variant = "neutral",
  icon,
  className = "",
  size = "md",
}: BadgeProps) {
  const variantStyles: Record<BadgeVariant, string> = {
    success: "bg-[#E6F4EE] text-[#0F6B50] border-[#B6E5D4]",
    warning: "bg-[#FFF2DB] text-[#8A5300] border-[#FFE0A3]",
    error: "bg-[#FDECEA] text-[#A11F15] border-[#F9C0BA]",
    info: "bg-[#EAF0FD] text-[#1D47B8] border-[#C4D7FA]",
    neutral: "bg-[#FAF7F2] text-[#776D6A] border-[#E7DED4]",
    burgundy: "bg-[#F4ECEF] text-[#632D3B] border-[#E5CDD4]",
  };

  const sizeStyles = {
    sm: "px-2 py-0.5 text-xs gap-1",
    md: "px-2.5 py-1 text-xs font-medium gap-1.5",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}
