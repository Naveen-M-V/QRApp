import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "muted" | "elevated";
}

export function Card({
  children,
  className = "",
  variant = "default",
  ...props
}: CardProps) {
  const variantStyles = {
    default: "bg-white border border-[#E7DED4] shadow-xs",
    muted: "bg-[#FAF7F2] border border-[#E7DED4]",
    elevated: "bg-white border border-[#E7DED4] shadow-md",
  };

  return (
    <div
      className={`rounded-lg p-5 transition-shadow ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className = "",
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between pb-4 border-b border-[#E7DED4] mb-4 ${className}`}>
      <div>
        <h3 className="text-base font-semibold text-[#292326] tracking-tight">{title}</h3>
        {subtitle && <p className="text-xs text-[#776D6A] mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0 ml-4">{action}</div>}
    </div>
  );
}
