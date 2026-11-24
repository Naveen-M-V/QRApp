"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from "lucide-react";

export type ToastKind = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  message: string;
  kind: ToastKind;
}

interface ToastContextType {
  toast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, kind: ToastKind = "success") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, kind }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => {
          const kindStyles: Record<ToastKind, { bg: string; border: string; text: string; icon: React.ReactNode }> = {
            success: {
              bg: "bg-[#E6F4EE]",
              border: "border-[#B6E5D4]",
              text: "text-[#0F6B50]",
              icon: <CheckCircle2 className="w-5 h-5 shrink-0 text-[#0F6B50]" />,
            },
            error: {
              bg: "bg-[#FDECEA]",
              border: "border-[#F9C0BA]",
              text: "text-[#A11F15]",
              icon: <AlertCircle className="w-5 h-5 shrink-0 text-[#A11F15]" />,
            },
            warning: {
              bg: "bg-[#FFF2DB]",
              border: "border-[#FFE0A3]",
              text: "text-[#8A5300]",
              icon: <AlertTriangle className="w-5 h-5 shrink-0 text-[#8A5300]" />,
            },
            info: {
              bg: "bg-[#EAF0FD]",
              border: "border-[#C4D7FA]",
              text: "text-[#1D47B8]",
              icon: <Info className="w-5 h-5 shrink-0 text-[#1D47B8]" />,
            },
          };

          const s = kindStyles[t.kind];

          return (
            <div
              key={t.id}
              role="alert"
              className={`pointer-events-auto flex items-center justify-between p-3.5 rounded-lg border shadow-lg ${s.bg} ${s.border} ${s.text} transition-all transform translate-y-0`}
            >
              <div className="flex items-center gap-3">
                {s.icon}
                <span className="text-sm font-medium leading-snug">{t.message}</span>
              </div>
              <button
                onClick={() => removeToast(t.id)}
                className="ml-3 p-1 rounded-md hover:bg-black/5 transition-colors"
                aria-label="Dismiss toast"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      toast: (message: string, kind?: ToastKind) => {
        if (typeof window !== "undefined") {
          console.log(`[Toast ${kind || "info"}]: ${message}`);
        }
      },
    };
  }
  return context;
}
