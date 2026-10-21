"use client";

import { usePathname } from "next/navigation";
import AdminGuard from "@/components/AdminGuard";
import AdminShell from "@/components/AdminShell";

const titles: Record<string, string> = {
  "/admin": "لوحة التحكم",
  "/admin/users": "المستخدمون",
  "/admin/kyc": "طلبات توثيق المستخدمين",
  "/admin/deposits": "مراجعة الإيداعات",
  "/admin/packages": "الباقات",
  "/admin/withdrawals": "السحوبات",
  "/admin/payments": "وسائل الإيداع",
  "/admin/rewards": "المكافآت",
  "/admin/notifications": "الإشعارات",
  "/admin/support": "الدعم",
  "/admin/orders": "أوامر التداول",
  "/admin/trading": "التداول",
  "/admin/trading-pairs": "أزواج التداول",
  "/admin/assets": "الأصول",
  "/admin/audit": "سجل المراجعة",
  "/admin/settings": "الإعدادات",
  "/admin/referral": "الإحالات",
  "/admin/risk": "إدارة المخاطر",
  "/admin/futures": "العقود الآجلة",
  "/admin/margin": "التداول بالهامش",
};

function getTitle(pathname: string) {
  if (pathname.startsWith("/admin/deposits/")) return "تفاصيل الإيداع";
  if (pathname.startsWith("/admin/kyc/")) return "مراجعة التوثيق";

  const exact = titles[pathname];
  if (exact) return exact;

  const section = Object.keys(titles)
    .filter((path) => path !== "/admin" && pathname.startsWith(path + "/"))
    .sort((a, b) => b.length - a.length)[0];

  return section ? titles[section] : "لوحة الإدارة";
}

/**
 * This workspace stays mounted as routes change. Navigation, the admin
 * session guard, and background notification refresh therefore don't restart
 * on every page click.
 */
export default function AdminWorkspace({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/admin";

  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
    return <>{children}</>;
  }

  return (
    <AdminGuard>
      <AdminShell title={getTitle(pathname)}>{children}</AdminShell>
    </AdminGuard>
  );
}
