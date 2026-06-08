import { ReactNode } from "react";

export default function ProveedorLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center gap-3">
        <span className="text-lg font-bold text-gray-900">TECHTRAFO</span>
        <span className="text-sm text-gray-400">|</span>
        <span className="text-sm text-gray-500">Portal de proveedor</span>
      </header>
      <main className="max-w-4xl mx-auto py-8 px-4">{children}</main>
    </div>
  );
}
