import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  ClipboardList,
  Gift,
  Home,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";

type DashboardNavigationSection = {
  title: string;
  href?: string;
  icon: LucideIcon;
  children?: ReadonlyArray<readonly [label: string, href: string]>;
};

/** Single source of truth for the authenticated workspace navigation. */
export const dashboardNavigation: DashboardNavigationSection[] = [
  {
    title: "الرئيسية",
    href: "/dashboard",
    icon: Home,
  },
  {
    title: "الأسواق",
    href: "/dashboard/markets",
    icon: BarChart3,
  },
  {
    title: "المحفظة",
    icon: WalletCards,
    children: [
      ["الإيداع", "/dashboard/assets/deposit"],
      ["الباقات", "/dashboard/packages"],
      ["السحب", "/dashboard/withdrawals"],
    ],
  },
  {
    title: "التداول",
    icon: ClipboardList,
    children: [
      ["التداول الفوري", "/protrade"],
      ["سجل التداول", "/dashboard/trades"],
    ],
  },
  {
    title: "مركز المكافآت",
    href: "/dashboard/rewards",
    icon: Gift,
  },
  {
    title: "الإحالة",
    href: "/dashboard/referral",
    icon: Users,
  },
  {
    title: "الحساب",
    icon: ShieldCheck,
    children: [["الملف الشخصي", "/dashboard/account"]],
  },
];
