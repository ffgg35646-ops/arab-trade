"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ChevronDown,
  ClipboardList,
  Gift,
  Home,
  PanelLeftClose,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";
import { useState } from "react";

const sections = [
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
      ["نظرة عامة", "/dashboard/assets"],
      ["الإيداع", "/dashboard/assets/deposit"],
      ["الباقات", "/dashboard/packages"],
      ["السحب", "/dashboard/withdrawals"],
      ["التمويل", "/dashboard/funding"],
    ],
  },
  {
    title: "التداول الفوري",
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
    children: [
      ["الملف الشخصي", "/dashboard/account"],
      ["كشف الحساب", "/dashboard/account/statement"],
      ["التقارير المالية", "/dashboard/account/reports"],
    ],
  },
];

export default function InternalSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({
    المحفظة: true,
    "التداول الفوري": true,
    الحساب: false,
  });

  const active = (href: string) =>
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(href + "/"));

  return (
    <aside
      dir="rtl"
      className={`hidden shrink-0 border-l border-white/10 bg-[#07101d] lg:block ${
        collapsed ? "w-[76px]" : "w-[240px]"
      } transition-all duration-200`}
    >
      <div className="sticky top-16 flex h-[calc(100vh-4rem)] flex-col">
        <div className="flex items-center justify-between border-b border-white/5 p-3">
          {!collapsed && (
            <span className="px-2 text-xs font-semibold text-slate-500">
              مساحة الحساب
            </span>
          )}

          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="rounded-xl p-2 text-slate-500 hover:bg-white/5 hover:text-white"
          >
            <PanelLeftClose
              size={17}
              className={collapsed ? "rotate-180" : ""}
            />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2.5">
          <div className="space-y-1">
            {sections.map((section) => {
              const Icon = section.icon;
              const sectionActive = section.href
                ? active(section.href)
                : false;

              if (section.children) {
                const expanded = open[section.title];

                return (
                  <div key={section.title}>
                    <button
                      type="button"
                      onClick={() =>
                        setOpen((old) => ({
                          ...old,
                          [section.title]: !old[section.title],
                        }))
                      }
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition ${
                        expanded || sectionActive
                          ? "text-white"
                          : "text-slate-400 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <Icon size={18} />

                      {!collapsed && (
                        <>
                          <span className="flex-1 text-right">
                            {section.title}
                          </span>

                          <ChevronDown
                            size={14}
                            className={`transition-transform ${
                              expanded ? "rotate-180" : ""
                            }`}
                          />
                        </>
                      )}
                    </button>

                    {!collapsed && expanded && (
                      <div className="mr-5 mt-1 space-y-1 border-r border-white/10 pr-2">
                        {section.children.map(([label, href]) => (
                          <Link
                            key={href}
                            href={href}
                            className={`block rounded-md px-3 py-2 text-xs transition ${
                              active(href)
                                ? "bg-blue-500/15 font-semibold text-cyan-300"
                                : "text-slate-500 hover:bg-white/5 hover:text-slate-200"
                            }`}
                          >
                            {label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={section.title}
                  href={section.href!}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${
                    sectionActive
                      ? "bg-blue-500/15 font-semibold text-cyan-300"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon size={18} />
                  {!collapsed && <span>{section.title}</span>}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </aside>
  );
}
