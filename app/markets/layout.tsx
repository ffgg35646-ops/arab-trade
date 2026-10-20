import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";

const secretText = process.env.AUTH_SECRET;

export default async function MarketsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let authenticated = false;

  if (secretText) {
    const cookieStore = await cookies();
    const token = cookieStore.get("arabtrade_session")?.value;
    if (token) {
      try {
        await jwtVerify(token, new TextEncoder().encode(secretText));
        authenticated = true;
      } catch {
        authenticated = false;
      }
    }
  }

  if (!authenticated) {
    return (
      <div dir="rtl" className="min-h-screen bg-[#050a13] text-white">
        <Navbar />
        {children}
        <Footer />
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#050a13] text-white">
      <InternalNavbar />
      <div className="mx-auto flex max-w-[1700px]">
        <InternalSidebar />
        <section className="min-w-0 flex-1">{children}</section>
      </div>
    </div>
  );
}
