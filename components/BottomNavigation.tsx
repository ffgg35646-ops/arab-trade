 "use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  BarChart3,
  CandlestickChart,
  UserRound,
  Menu,
} from "lucide-react";

const items = [
  {
    href: "/",
    label: "الرئيسية",
    icon: Home,
  },
  {
    href: "/markets",
    label: "الأسواق",
    icon: BarChart3,
  },
  {
    href: "/trading",
    label: "التداول",
    icon: CandlestickChart,
  },
  {
    href: "/login",
    label: "الحساب",
    icon: UserRound,
  },
];

export default function BottomNavigation() {
  const pathname = usePathname();

  return (
    <div
      dir="rtl"
      className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-3 md:hidden"
    >
      <nav className="mx-auto flex max-w-md items-center justify-around rounded-2xl border border-white/10 bg-[#07101d]/95 px-2 py-2 shadow-2xl shadow-black/50 backdrop-blur-xl">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href ||
                pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-[68px] flex-col items-center gap-1 rounded-xl px-3 py-2 transition ${
                active
                  ? "bg-cyan-400/10 text-cyan-300"
                  : "text-slate-500 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon size={19} strokeWidth={active ? 2.4 : 2} />
              <span className="text-[10px] font-semibold">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}