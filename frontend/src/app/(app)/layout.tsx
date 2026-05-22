import Link from "next/link";
import { LogoutButton } from "./logout-button";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r bg-muted/20 p-4">
        <div className="mb-6">
          <h1 className="text-xl font-bold">TECHTRAFO</h1>
          <p className="text-xs text-muted-foreground">Panel de gestion</p>
        </div>
        <nav className="space-y-1 text-sm">
          <Link
            href="/dashboard"
            className="block rounded px-3 py-2 hover:bg-accent hover:text-accent-foreground"
          >
            Dashboard
          </Link>
          <Link
            href="/clientes"
            className="block rounded px-3 py-2 hover:bg-accent hover:text-accent-foreground"
          >
            Clientes
          </Link>
          <Link
            href="/cotizaciones"
            className="block rounded px-3 py-2 hover:bg-accent hover:text-accent-foreground"
          >
            Cotizaciones
          </Link>
        </nav>
        <div className="mt-8 border-t pt-4">
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
