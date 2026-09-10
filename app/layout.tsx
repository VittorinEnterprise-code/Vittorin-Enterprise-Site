import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Vittorin Enterprise — Tecnologia com propósito",
    template: "%s · Vittorin Enterprise",
  },
  description:
    "Aplicativos e experiências digitais criados pela Vittorin Enterprise.",
  icons: {
    icon: "/brand/vittorin-mark.webp",
    shortcut: "/brand/vittorin-mark.webp",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>
          {children}
          <Toaster position="bottom-right" richColors />
        </Providers>
      </body>
    </html>
  );
}
