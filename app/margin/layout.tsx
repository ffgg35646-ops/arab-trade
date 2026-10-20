import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
export default async function MarginLayout({ children }: { children: React.ReactNode }) {
  const secretText = process.env.AUTH_SECRET;
  if (!secretText) redirect("/login");
  const session = (await cookies()).get("arabtrade_session")?.value;
  if (!session) redirect("/login");
  try { await jwtVerify(session, new TextEncoder().encode(secretText)); }
  catch { redirect("/login"); }
  return children;
}
