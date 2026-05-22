import { redirect } from "next/navigation";

export default function Home() {
  // El middleware decide /login vs /dashboard segun cookie; este redirect
  // es solo el camino por defecto si alguien aterriza en "/"
  redirect("/dashboard");
}
