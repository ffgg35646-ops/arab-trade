import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import DashboardWorkspace from "@/components/DashboardWorkspace";

const secretText = process.env.AUTH_SECRET;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!secretText) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const session = cookieStore.get("arabtrade_session")?.value;

  if (!session) {
    redirect("/login");
  }

  try {
    const secret = new TextEncoder().encode(secretText);
    await jwtVerify(session, secret);
  } catch {
    redirect("/login");
  }

  return <DashboardWorkspace>{children}</DashboardWorkspace>;
}