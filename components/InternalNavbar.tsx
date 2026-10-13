"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  ChevronDown,
  LogOut,
  Search,
  Wallet,
  UserCircle,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

const menus = [
  {
    title: "تداول",
    items: [
      ["التداول الفوري", "/protrade"],
      ["التداول الاحترافي", "/protrade/pro"],
      ["التداول بالهامش", "/margin"],
      ["إدارة الأوامر", "/dashboard/orders"],
      ["سجل الأوامر", "/dashboard/orders/history"],
      ["سجل التداول", "/dashboard/trades"],
    ],
  },
  {
    title: "العقود الآجلة",
    items: [
      ["العقود الآجلة", "/futures"],
      ["تداول العقود", "/trading/futures"],
    ],
  },
  {
    title: "كسب",
    items: [
      ["نظرة عامة", "/earn"],
      ["المكافآت", "/dashboard/rewards"],
    ],
  },
  {
    title: "المزيد",
    items: [
      ["الإحالة", "/dashboard/referral"],
      ["API", "/dashboard/account/api"],
    ],
  },
];

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

  const [open, setOpen] =
    useState<string | null>(null);

  const [mobile, setMobile] =
    useState(false);

  const [
    unreadNotifications,
    setUnreadNotifications,
  ] = useState(0);

  const [depositBalanceSummary, setDepositBalanceSummary] = useState("0 USDT");
  const [withdrawUsdtBalance, setWithdrawUsdtBalance] = useState(0);

  const ref =
    useRef<HTMLDivElement>(null);

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
        const withdrawalBalances = Array.isArray(data.withdrawalBalances) ? data.withdrawalBalances : [];
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
        const withdrawalUsdt = withdrawalBalances
          .filter((item: { asset?: string }) => String(item.asset || "").toUpperCase() === "USDT")
          .reduce((sum: number, item: { available?: number }) => sum + Number(item.available || 0), 0);

        setDepositBalanceSummary(depositSummary || "0 USDT");
        setWithdrawUsdtBalance(withdrawalUsdt);
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
    const onClick = (
      event: MouseEvent
    ) => {
      if (
        !ref.current?.contains(
          event.target as Node
        )
      ) {
        setOpen(null);
      }
    };

    document.addEventListener(
      "mousedown",
      onClick
    );

    return () =>
      document.removeEventListener(
        "mousedown",
        onClick
      );
  }, []);

  useEffect(() => {
    setOpen(null);
    setMobile(false);
  }, [pathname]);

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
      ref={ref}
      dir="rtl"
      className="sticky top-0 z-50 border-b border-white/10 bg-[#050a13]/95 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 max-w-[1700px] items-center gap-3 px-4 lg:px-6">

        {/* Mobile menu */}
        <button
          type="button"
          onClick={() =>
            setMobile(
              (value) => !value
            )
          }
          className="rounded-xl border border-white/10 p-2 text-slate-300 transition hover:bg-white/5 hover:text-white xl:hidden"
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
            className="h-9 w-auto"
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
            href="/markets"
            className={`rounded-xl px-3 py-2 text-sm transition ${
              isActive(
                pathname,
                "/markets"
              )
                ? "bg-blue-500/10 text-cyan-300"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            الأسواق
          </Link>

          {menus.map(
            (menu) => {
              const menuActive =
                menu.items.some(
                  ([, href]) =>
                    isActive(
                      pathname,
                      href
                    )
                );

              return (
                <div
                  key={menu.title}
                  className="relative"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOpen(
                        (value) =>
                          value ===
                          menu.title
                            ? null
                            : menu.title
                      )
                    }
                    className={`flex items-center gap-1 rounded-xl px-3 py-2 text-sm transition ${
                      open ===
                        menu.title ||
                      menuActive
                        ? "bg-white/5 text-white"
                        : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {menu.title}
                    <ChevronDown
                      size={14}
                    />
                  </button>

                  {open ===
                    menu.title && (
                    <div className="absolute right-0 top-full pt-2">
                      <div className="w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#07101d] p-2 shadow-2xl shadow-black/40">
                        {menu.items.map(
                          ([
                            label,
                            href,
                          ]) => (
                            <Link
                              key={`${label}-${href}`}
                              href={
                                href
                              }
                              onClick={() =>
                                setOpen(
                                  null
                                )
                              }
                              className={`block rounded-xl px-3 py-3 text-xs transition ${
                                isActive(
                                  pathname,
                                  href
                                )
                                  ? "bg-blue-500/10 text-cyan-300"
                                  : "text-slate-400 hover:bg-white/5 hover:text-white"
                              }`}
                            >
                              {
                                label
                              }
                            </Link>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            }
          )}
        </nav>

        {/* Right actions */}
        <div className="mr-auto flex items-center gap-2">

          <Link
            href="/markets"
            className="hidden rounded-xl border border-white/10 p-2.5 text-slate-300 transition hover:bg-white/5 hover:text-white md:flex"
            aria-label="الأسواق والبحث"
            title="الأسواق"
          >
            <Search size={18} />
          </Link>

          <div className="hidden items-center gap-1 md:flex xl:gap-2">
            <Link href="/dashboard/assets/deposit" className="max-w-[230px] rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-2 py-2 transition hover:bg-amber-300/[0.1] xl:px-3" title={`رصيد USDT: ${depositBalanceSummary}`}>
              <span className="block text-[10px] text-amber-200/80">رصيد USDT</span>
              <span className="block max-w-[205px] truncate text-xs font-black text-amber-100">{depositBalanceSummary}</span>
            </Link>
            <Link href="/dashboard/assets/withdraw" className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] px-2 py-2 transition hover:bg-cyan-300/[0.1] xl:px-3" title="إجمالي رصيد السحب العام وأرصدة الباقات">
              <span className="block text-[10px] text-cyan-200/80">رصيد السحب</span>
              <span className="block text-xs font-black text-cyan-100">{withdrawUsdtBalance.toLocaleString("en-US", { maximumFractionDigits: 8 })} USDT</span>
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
            className={`rounded-xl border p-2.5 transition ${
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

      {/* Mobile navigation */}
      {mobile && (
        <div className="border-t border-white/10 bg-[#07101d] p-3 xl:hidden">
          <div className="grid gap-1">

            <Link
              href="/dashboard"
              onClick={() =>
                setMobile(false)
              }
              className={`rounded-xl px-3 py-3 text-sm transition ${
                isActive(
                  pathname,
                  "/dashboard"
                )
                  ? "bg-blue-500/10 text-cyan-300"
                  : "text-slate-300 hover:bg-white/5"
              }`}
            >
              الرئيسية
            </Link>

            <Link
              href="/markets"
              onClick={() =>
                setMobile(false)
              }
              className={`rounded-xl px-3 py-3 text-sm transition ${
                isActive(
                  pathname,
                  "/markets"
                )
                  ? "bg-blue-500/10 text-cyan-300"
                  : "text-slate-300 hover:bg-white/5"
              }`}
            >
              الأسواق
            </Link>

            {menus.map(
              (menu) => (
                <div
                  key={menu.title}
                  className="rounded-2xl border border-white/5 bg-white/[0.015] p-1"
                >
                  <div className="px-3 py-2 text-[10px] font-bold text-slate-600">
                    {menu.title}
                  </div>

                  {menu.items.map(
                    ([
                      label,
                      href,
                    ]) => (
                      <Link
                        key={`${label}-${href}`}
                        href={
                          href
                        }
                        onClick={() =>
                          setMobile(
                            false
                          )
                        }
                        className={`block rounded-xl px-3 py-3 text-sm transition ${
                          isActive(
                            pathname,
                            href
                          )
                            ? "bg-blue-500/10 text-cyan-300"
                            : "text-slate-400 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        {
                          label
                        }
                      </Link>
                    )
                  )}
                </div>
              )
            )}

            <div className="grid grid-cols-2 gap-2">
              <Link href="/dashboard/assets/deposit" onClick={() => setMobile(false)} className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-3">
                <span className="block text-[10px] text-amber-200/80">رصيد USDT</span>
                <span className="mt-1 block break-words text-xs font-black leading-5 text-amber-100">{depositBalanceSummary}</span>
              </Link>
              <Link href="/dashboard/assets/withdraw" onClick={() => setMobile(false)} className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-3">
                <span className="block text-[10px] text-cyan-200/80">رصيد السحب</span>
                <span className="mt-1 block text-xs font-black text-cyan-100">{withdrawUsdtBalance.toLocaleString("en-US", { maximumFractionDigits: 8 })} USDT</span>
              </Link>
            </div>

            <Link
              href="/dashboard/notifications"
              onClick={() =>
                void openNotifications()
              }
              className="rounded-xl px-3 py-3 text-sm text-slate-400 hover:bg-white/5 hover:text-white"
            >
              الإشعارات
              {unreadNotifications >
              0
                ? ` (${unreadNotifications > 99 ? "99+" : unreadNotifications})`
                : ""}
            </Link>

            <Link
              href="/dashboard/assets"
              onClick={() =>
                setMobile(false)
              }
              className="rounded-xl px-3 py-3 text-sm text-slate-400 hover:bg-white/5 hover:text-white"
            >
              المحفظة
            </Link>

            <Link
              href="/dashboard/account"
              onClick={() =>
                setMobile(false)
              }
              className="rounded-xl px-3 py-3 text-sm text-slate-400 hover:bg-white/5 hover:text-white"
            >
              الحساب
            </Link>

            <button
              type="button"
              onClick={
                logout
              }
              className="flex items-center gap-2 rounded-xl px-3 py-3 text-right text-sm text-red-300 hover:bg-red-500/10"
            >
              <LogOut
                size={16}
              />
              تسجيل الخروج
            </button>
          </div>
        </div>
      )}
    </header>
  );
}