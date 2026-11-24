"use client";

import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  isLoading = false,
  icon,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none rounded-md";

  const sizeStyles = {
    sm: "px-3 py-1.5 text-xs gap-1.5",
    md: "px-4 py-2 text-sm gap-2",
    lg: "px-5 py-2.5 text-base gap-2.5",
  };

  const variantStyles = {
    primary:
      "bg-[#632D3B] text-white hover:bg-[#4E232E] focus:ring-[#632D3B] border border-transparent shadow-xs",
    secondary:
      "bg-[#FAF7F2] text-[#292326] hover:bg-[#EFE6D9] focus:ring-[#C7A878] border border-[#E7DED4]",
    outline:
      "bg-transparent text-[#632D3B] hover:bg-[#F4ECEF] focus:ring-[#632D3B] border border-[#632D3B]/30",
    danger:
      "bg-[#A11F15] text-white hover:bg-[#831810] focus:ring-[#A11F15] border border-transparent shadow-xs",
    ghost:
      "bg-transparent text-[#776D6A] hover:text-[#292326] hover:bg-[#EFE6D9]/50 focus:ring-[#C7A878]",
  };

  return (
    <button
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      {children}
    </button>
  );
}
