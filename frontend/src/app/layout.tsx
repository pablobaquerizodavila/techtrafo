import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TECHTRAFO",
  description: "Panel de gestion TECHTRAFO",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">{children}</body>
    </html>
  );
}
