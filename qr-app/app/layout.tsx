import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: "Athryan QR Manager | Athryan Tech Solution",
  description: "Production-Ready Student QR Generation, Verification & Printing Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#F7F1E9] text-[#292326]">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
