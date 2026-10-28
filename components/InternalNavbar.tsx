"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  ChevronDown,
  CircleDollarSign,
  LogOut,
  Search,
  Wallet,
  UserCircle,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { dashboardNavigation } from "@/components/dashboard-navigation";

function isActive(
  pathname: string,
  href: string
) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return (
    pathname === href ||
    pathname.startsWith(`${href}/`)
  );
}

export default function InternalNavbar() {
  const pathname = usePathname();
  const router = useRouter();

  const [mobile, setMobile] = useState(false);
  const [mobileBalanceOpen, setMobileBalanceOpen] = useState(false);
  const [mobileSectionsOpen, setMobileSectionsOpen] = useState<Record<string, boolean>>({
    المحفظة: true,
    التداول: true,
  });

  const [
    unreadNotifications,
    setUnreadNotifications,
  ] = useState(0);

  const [depositBalanceSummary, setDepositBalanceSummary] = useState("—");
  const [withdrawalBalanceSummary, setWithdrawalBalanceSummary] = useState("—");

  useEffect(() => {
    let cancelled = false;

    async function loadWithdrawalBalance() {
      try {
        const response = await fetch("/api/withdrawals/balance", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!data?.success || cancelled) return;

        const amount = Number(data.withdrawalBalance);
        if (!Number.isFinite(amount) || amount < 0) return;

        setWithdrawalBalanceSummary(
          amount.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 8,
          }) + " USDT"
        );
      } catch {
        // Keep the last known withdrawal balance if the request fails.
      }
    }

    void loadWithdrawalBalance();
    const timer = window.setInterval(() => void loadWithdrawalBalance(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadNotificationCount() {
      try {
        const res = await fetch(
          "/api/notifications",
          {
            credentials: "include",
            cache: "no-store",
          }
        );

        if (!res.ok) return;

        const json = await res.json();

        if (!cancelled) {
          setUnreadNotifications(
            Math.max(
              0,
              Number(
                json?.unreadCount || 0
              )
            )
          );
        }
      } catch {
        // الاحتفاظ بآخر قيمة ناجحة
      }
    }

    void loadNotificationCount();

    const timer =
      window.setInterval(
        () => {
          void loadNotificationCount();
        },
        5000
      );

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadBalances() {
      try {
        const response = await fetch("/api/wallet", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!data?.success || cancelled) return;

        const depositBalances = Array.isArray(data.depositBalances) ? data.depositBalances : [];
        const depositSummary = depositBalances
          .map((item: { asset?: string; available?: number; locked?: number }) => ({
            asset: String(item.asset || "").trim().toUpperCase(),
            available: Number(item.available || 0),
            locked: Number(item.locked || 0),
          }))
          .filter((item: { asset: string; available: number; locked: number }) => item.asset && (item.available !== 0 || item.locked !== 0))
          .map((item: { asset: string; available: number; locked: number }) =>
            `${item.available.toLocaleString("en-US", { maximumFractionDigits: 8 })} ${item.asset}${item.locked > 0 ? ` (+${item.locked.toLocaleString("en-US", { maximumFractionDigits: 8 })} محجوز)` : ""}`
          )
          .join(" · ");
        setDepositBalanceSummary(depositSummary || "0 USDT");
      } catch {
        // احتفظ بآخر أرصدة ناجحة بدل تصفيرها عند انقطاع الشبكة
      }
    }

    void loadBalances();
    const timer = window.setInterval(() => void loadBalances(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    setMobile(false);
    setMobileBalanceOpen(false);
  }, [pathname]);

  // Keep remembered sessions alive while the authenticated workspace is in use.
  useEffect(() => {
    let cancelled = false;

    async function refreshSession() {
      try {
        await fetch("/api/auth/me", {
          credentials: "same-origin",
          cache: "no-store",
        });
      } catch {
        // A temporary network failure should not interrupt the current screen.
      }
    }

    void refreshSession();
    const timer = window.setInterval(() => {
      if (!cancelled) void refreshSession();
    }, 10 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  async function logout() {
    try {
      await fetch(
        "/api/auth/logout",
        {
          method: "POST",
          credentials: "include",
        }
      );
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  async function openNotifications() {
    setUnreadNotifications(0);

    try {
      await fetch(
        "/api/notifications",
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({}),
        }
      );
    } catch {
      // لا نمنع الانتقال إذا تعذر تحديث حالة القراءة
    }
  }

  return (
    <header
      dir="rtl"
      className="sticky top-0 z-50 border-b border-white/10 bg-[#050a13]/95 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 max-w-[1700px] items-center gap-2 px-3 sm:gap-3 sm:px-4 lg:px-6">

        {/* Mobile menu */}
        <button
          type="button"
          onClick={() => {
            setMobileBalanceOpen(false);
            setMobile((value) => !value);
          }}
          className="shrink-0 rounded-xl border border-white/10 p-2 text-slate-300 transition hover:bg-white/5 hover:text-white xl:hidden"
          aria-label="القائمة"
        >
          {mobile ? (
            <X size={19} />
          ) : (
            <ChevronDown size={19} />
          )}
        </button>

        {/* Logo */}
        <Link
          href="/dashboard"
          className="shrink-0"
          aria-label="عرب تريد"
        >
          <img
            src="/logo.svg"
            alt="عرب تريد"
            className="h-8 w-auto sm:h-9"
          />
        </Link>

        {/* Desktop navigation */}
        <nav className="hidden items-center gap-1 xl:flex">

          <Link
            href="/dashboard"
            className={`rounded-xl px-3 py-2 text-sm transition ${
              isActive(
                pathname,
                "/dashboard"
              )
                ? "bg-blue-500/10 text-cyan-300"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            الرئيسية
          </Link>

          <Link
            href="/dashboard/markets"
            className={`rounded-xl px-3 py-2 text-sm transition ${
              isActive(
                pathname,
                "/dashboard/markets"
              )
                ? "bg-blue-500/10 text-cyan-300"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            الأسواق
          </Link>

          <Link
            href="/protrade"
            className={`rounded-xl px-3 py-2 text-sm transition ${
              isActive(pathname, "/protrade")
                ? "bg-blue-500/10 text-cyan-300"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            التداول
          </Link>

          <Link
            href="/dashboard/packages"
            className={`rounded-xl px-3 py-2 text-sm transition ${
              isActive(pathname, "/dashboard/packages")
                ? "bg-blue-500/10 text-cyan-300"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            الباقات
          </Link>
        </nav>

        {/* Right actions */}
        <div className="mr-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <div className="relative md:hidden">
            <button
              type="button"
              onClick={() => {
                setMobileBalanceOpen((value) => !value);
                setMobile(false);
              }}
              aria-expanded={mobileBalanceOpen}
              aria-controls="mobile-balances"
              className="flex items-center gap-1 rounded-xl border border-white/10 px-2.5 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5"
            >
              <Wallet size={16} />
              الرصيد
              <ChevronDown size={14} className={mobileBalanceOpen ? "rotate-180 transition-transform" : "transition-transform"} />
            </button>
            {mobileBalanceOpen && (
              <div id="mobile-balances" className="absolute left-0 top-full z-[70] mt-2 w-[min(18rem,calc(100vw-1.5rem))] space-y-2 rounded-2xl border border-white/10 bg-[#07101d] p-3 shadow-2xl shadow-black/50">
                <Link href="/dashboard/assets/deposit" onClick={() => setMobileBalanceOpen(false)} className="block rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3">
                  <span className="block text-xs text-amber-200/80">رصيد الإيداع</span>
                  <strong className="mt-1 block break-words text-sm text-amber-100">{depositBalanceSummary}</strong>
                </Link>
                <Link href="/dashboard/withdrawals" onClick={() => setMobileBalanceOpen(false)} className="block rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] p-3">
                  <span className="block text-xs text-cyan-200/80">رصيد السحب</span>
                  <strong className="mt-1 block break-words text-sm text-cyan-100">{withdrawalBalanceSummary}</strong>
                </Link>
              </div>
            )}
          </div>

          <Link
            href="/dashboard/markets"
            className="hidden rounded-xl border border-white/10 p-2.5 text-slate-300 transition hover:bg-white/5 hover:text-white md:flex"
            aria-label="الأسواق والبحث"
            title="الأسواق"
          >
            <Search size={18} />
          </Link>

          <div className="hidden items-center gap-1 md:flex xl:gap-2">
            <Link href="/dashboard/assets/deposit" className="max-w-[230px] rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-2 py-2 transition hover:bg-amber-300/[0.1] xl:px-3" title={`رصيد الإيداع الخارجي: ${depositBalanceSummary}`}>
              <span className="block text-[10px] text-amber-200/80">رصيد الإيداع</span>
              <span className="block max-w-[205px] truncate text-xs font-black text-amber-100">{depositBalanceSummary}</span>
            </Link>
          </div>

          <div className="hidden max-w-[190px] items-center xl:flex">
            <Link
              href="/dashboard/withdrawals"
              className="max-w-[190px] rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] px-2 py-2 transition hover:bg-cyan-300/[0.1] xl:px-3"
              title="إجمالي السحب المتاح من السحب العام والباقات، باستثناء المبالغ المحجوزة لطلبات السحب"
            >
              <span className="block text-[10px] text-cyan-200/80"><CircleDollarSign size={12} className="ml-1 inline-block" />إجمالي السحب</span>
              <span className="block max-w-[170px] truncate text-xs font-black text-cyan-100">{withdrawalBalanceSummary}</span>
            </Link>
          </div>

          <Link
            href="/dashboard/notifications"
            onClick={() =>
              void openNotifications()
            }
            className={`relative rounded-xl border p-2.5 transition ${
              isActive(
                pathname,
                "/dashboard/notifications"
              )
                ? "border-blue-400/20 bg-blue-500/10 text-cyan-300"
                : "border-white/10 text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
            aria-label="الإشعارات"
            title="الإشعارات"
          >
            <Bell size={18} />

            {unreadNotifications >
            0 ? (
              <span className="absolute -right-1 -top-1 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-[#050a13] bg-red-600 px-1 text-[9px] font-black leading-none text-white">
                {unreadNotifications >
                99
                  ? "99+"
                  : unreadNotifications}
              </span>
            ) : null}
          </Link>

          <Link
            href="/dashboard/assets"
            className={`hidden sm:flex rounded-xl border p-2.5 transition ${
              isActive(
                pathname,
                "/dashboard/assets"
              )
                ? "border-blue-400/20 bg-blue-500/10 text-cyan-300"
                : "border-white/10 text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
            aria-label="المحفظة"
            title="المحفظة"
          >
            <Wallet size={18} />
          </Link>

          <Link
            href="/dashboard/account"
            className={`rounded-xl border p-2.5 transition ${
              isActive(
                pathname,
                "/dashboard/account"
              )
                ? "border-blue-400/20 bg-blue-500/10 text-cyan-300"
                : "border-white/10 text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
            aria-label="الحساب"
            title="الحساب"
          >
            <UserCircle
              size={18}
            />
          </Link>

          <button
            type="button"
            onClick={
              logout
            }
            className="hidden rounded-xl border border-white/10 p-2.5 text-slate-400 transition hover:border-red-400/20 hover:bg-red-500/10 hover:text-red-300 md:flex"
            aria-label="تسجيل الخروج"
            title="تسجيل الخروج"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Mobile navigation uses the exact same route configuration as the desktop sidebar. */}
      {mobile && (
        <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-t border-white/10 bg-[#07101d] p-3 xl:hidden">
          <nav aria-label="القائمة الرئيسية للحساب" className="space-y-1">
            {dashboardNavigation.map((section) => {
              const Icon = section.icon;
              const sectionActive = section.href
                ? isActive(pathname, section.href)
                : Boolean(section.children?.some(([, href]) => isActive(pathname, href)));

              if (section.children) {
                const expanded = mobileSectionsOpen[section.title] ?? sectionActive;

                return (
                  <div key={section.title}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() =>
                        setMobileSectionsOpen((current) => ({
                          ...current,
                          [section.title]: !expanded,
                        }))
                      }
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${
                        expanded || sectionActive
                          ? "bg-white/[0.035] text-white"
                          : "text-slate-400 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <Icon size={18} />
                      <span className="flex-1 text-right">{section.title}</span>
                      <ChevronDown size={15} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </button>

                    {expanded && (
                      <div className="mr-5 mt-1 space-y-1 border-r border-white/10 pr-2">
                        {section.children.map(([label, href]) => (
                          <Link
                            key={href}
                            href={href}
                            onClick={() => setMobile(false)}
                            aria-current={isActive(pathname, href) ? "page" : undefined}
                            className={`block rounded-lg px-3 py-2.5 text-xs transition ${
                              isActive(pathname, href)
                                ? "bg-blue-500/15 font-semibold text-cyan-300"
                                : "text-slate-400 hover:bg-white/5 hover:text-white"
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
                  onClick={() => setMobile(false)}
                  aria-current={sectionActive ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${
                    sectionActive
                      ? "bg-blue-500/15 font-semibold text-cyan-300"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon size={18} />
                  <span>{section.title}</span>
                </Link>
              );
            })}
          </nav>


          <button
            type="button"
            onClick={logout}
            className="mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-3 text-right text-sm text-red-300 transition hover:bg-red-500/10"
          >
            <LogOut size={16} />
            تسجيل الخروج
          </button>
        </div>
      )}
    </header>
  );
}