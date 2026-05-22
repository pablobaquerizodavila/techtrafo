"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/auth";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    try {
      await logout();
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <Button variant="outline" size="sm" className="w-full" onClick={handleLogout}>
      Cerrar sesion
    </Button>
  );
}
