"use client";
import { apiFetch } from "@/lib/frontend-api";

import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BadgeCheck,
  ChevronLeft,
  CircleHelp,
  Eye,
  Gift,
  ShieldCheck,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
  BarChart3,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";
import {
  Panel,
  EmptyState,
  ActionCards,
} from "@/components/dashboard/AccountUI";

type UserData = {
  id: string;
  name: string;
  username: string;
  email: string;
  referralCode: string;
  isVerified: boolean;
  isActive: boolean;
  createdAt: string;
};

type MarketItem = {
  symbol?: string;
  name?: string;
  price?: number | string;
  lastPrice?: number | string;
  current_price?: number | string;
  change24h?: number | string;
  priceChangePercent?: number | string;
};

type WalletBalance = {
  asset?: string;
  available?: number | string;
  locked?: number | string;
};

export default function DashboardPage() {
  const [user, setUser] = useState<UserData | null>(null);
  const [markets, setMarkets] = useState<MarketItem[]>([]);
  const [walletBalances, setWalletBalances] = useState<WalletBalance[]>([]);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingWallet, setLoadingWallet] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [userRes, marketRes, walletRes] = await Promise.all([
          fetch("/api/auth/me", { cache: "no-store" }),
          fetch("/api/market", { cache: "no-store" }),
          fetch("/api/wallet", {
            credentials: "include",
            cache: "no-store",
          }),
        ]);

        if (!active) return;

        if (userRes.ok) {
          const data = await userRes.json();
          setUser(data.user ?? null);
        }

        if (marketRes.ok) {
          const data = await marketRes.json();
          setMarkets(Array.isArray(data?.coins) ? data.coins : []);
        }

        if (walletRes.ok) {
          const data = await walletRes.json();
          setWalletBalances(
            data?.spot?.balances ??
            data?.wallet?.balances ??
            []
          );
        }
      } catch (error) {
        console.error("Dashboard load error:", error);
      } finally {
        if (active) {
          setLoadingUser(false);
          setLoadingWallet(false);
        }
      }
    }

    void load();

    const timer = window.setInterval(() => {
      void load();
    }, 10000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const visibleMarkets = useMemo(
    () => markets.slice(0, 6),
    [markets]
  );

  const marketPrices = useMemo(() => {
    const map = new Map<string, number>();

    for (const item of markets) {
      const symbol = String(item.symbol || "")
        .trim()
        .toUpperCase();

      const price = Number(
        item.current_price ??
        item.lastPrice ??
        item.price
      );

      if (
        symbol &&
        Number.isFinite(price) &&
        price >= 0
      ) {
        map.set(symbol, price);
      }
    }

    // USDT مرجع 1 دولار
    map.set("USDT", 1);

    return map;
  }, [markets]);

  const portfolio = useMemo(() => {
    let totalValueUsd = 0;
    let availableValueUsd = 0;
    let lockedValueUsd = 0;

    for (const balance of walletBalances) {
      const asset = String(balance.asset || "")
        .trim()
        .toUpperCase();

      const available = Number(balance.available || 0);
      const locked = Number(balance.locked || 0);
      const price = marketPrices.get(asset);

      if (
        !asset ||
        !Number.isFinite(available) ||
        !Number.isFinite(locked) ||
        price === undefined ||
        !Number.isFinite(price)
      ) {
        continue;
      }

      availableValueUsd += available * price;
      lockedValueUsd += locked * price;
    }

    totalValueUsd =
      availableValueUsd + lockedValueUsd;

    return {
      totalValueUsd,
      availableValueUsd,
      lockedValueUsd,
    };
  }, [marketPrices, walletBalances]);

  const formatUsd = (value: number) =>
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(
      Number.isFinite(value) ? value : 0
    );

  return (
    <main dir="rtl" className="min-h-screen bg-[#050a13] text-white">
      <InternalNavbar />

      <div className="mx-auto flex max-w-[1700px]">
        <InternalSidebar />

        <section className="min-w-0 flex-1">
          <div className="p-4 md:p-6 lg:p-8">
            <div className="mb-6 flex flex-col justify-between gap-5 rounded-2xl border border-white/10 bg-[#07101d] p-5 md:flex-row md:items-center">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-400/10">
                  <UserRound size={27} className="text-cyan-300" />
                </div>

                <div>
                  {loadingUser ? (
                    <div className="text-sm text-slate-500">
                      جاري تحميل بيانات الحساب...
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-xl font-bold">
                          {user?.name || "حسابي"}
                        </h1>

                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs ${
                              user?.isVerified
                                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                                : "border-red-400/20 bg-red-400/10 text-red-300"
                            }`}
                          >
                            {user?.isVerified
                              ? "الحساب موثق"
                              : "الحساب غير موثق"}
                          </span>

                          {!user?.isVerified && (
                            <Link
                              href="/dashboard/account/verification"
                              className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-cyan-400"
                            >
                              وثّق الآن
                            </Link>
                          )}
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
                        <span>اسم المستخدم: @{user?.username || "—"}</span>
                        <span>UID: {user?.id || "—"}</span>
                        <span>{user?.email || "—"}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

            </div>

            <div className="mb-6 grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
              <Panel
                title="القيمة الإجمالية"
                description="إجمالي أصولك محسوب من أرصدة المحفظة الحقيقية وأسعار السوق الحالية."
                right={
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    USDT <Eye size={14} />
                  </div>
                }
              >
                <div className="p-5">
                  <div className="flex flex-col justify-between gap-5 md:flex-row">
                    <div>
                      <div className="text-3xl font-bold">
                        {loadingWallet
                          ? "..."
                          : `${formatUsd(portfolio.totalValueUsd)} USDT`}
                      </div>
                      <div className="mt-2 text-xs text-slate-600">
                        القيمة بالدولار:{" "}
                        {loadingWallet
                          ? "..."
                          : `$${formatUsd(portfolio.totalValueUsd)}`}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link
                        href="/dashboard/assets/deposit"
                        className="flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-3 text-xs font-bold"
                      >
                        <ArrowDownToLine size={15} />
                        إيداع
                      </Link>

                      <Link
                        href="/dashboard/assets/withdraw"
                        className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs text-slate-300"
                      >
                        <ArrowUpFromLine size={15} />
                        سحب
                      </Link>

                      <Link
                        href="/markets"
                        className="flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-400/15"
                      >
                        <BarChart3 size={15} />
                        الأسواق
                      </Link>

                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                      <div className="text-xs text-slate-600">
                        أرباح / خسائر اليوم
                      </div>
                      <div className="mt-2 font-mono text-sm text-slate-500">
                        —
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                      <div className="text-xs text-slate-600">
                        الرصيد المتاح
                      </div>
                      <div className="mt-2 font-mono text-sm text-slate-300">
                        {loadingWallet
                          ? "..."
                          : `${formatUsd(portfolio.availableValueUsd)} USDT`}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                      <div className="text-xs text-slate-600">
                        الرصيد المقفل
                      </div>
                      <div className="mt-2 font-mono text-sm text-slate-300">
                        {loadingWallet
                          ? "..."
                          : `${formatUsd(portfolio.lockedValueUsd)} USDT`}
                      </div>
                    </div>
                  </div>
                </div>
              </Panel>


            </div>

            <div className="mb-6">
              <ActionCards />
            </div>

            <div className="mb-6 grid gap-4 xl:grid-cols-3">

              <Panel
                title="حالة الحساب"
                description="حالة التوثيق والأمان"
              >
                <div className="p-5">
                  <div className={`rounded-xl border p-4 ${
                    user?.isVerified
                      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                      : "border-red-400/20 bg-red-400/10 text-red-300"
                  }`}>
                    {user?.isVerified
                      ? "الحساب موثق"
                      : "الحساب يحتاج توثيق"}
                  </div>

                  {!user?.isVerified && (
                    <Link
                      href="/dashboard/account/verification"
                      className="mt-4 block rounded-xl bg-cyan-500 px-4 py-3 text-center text-sm font-bold text-black"
                    >
                      توثيق الحساب
                    </Link>
                  )}
                </div>
              </Panel>


              <Panel
                title="عمليات سريعة"
                description="الوصول للخدمات"
              >
                <div className="grid gap-2 p-5">
                  <Link
                    href="/dashboard/assets/transfer"
                    className="rounded-xl border border-white/10 p-3 text-center text-sm"
                  >
                    تحويل
                  </Link>

                  <Link
                    href="/trading/spot"
                    className="rounded-xl border border-white/10 p-3 text-center text-sm"
                  >
                    التداول
                  </Link>
                </div>
              </Panel>


              <Panel
                title="آخر النشاطات"
                description="عمليات الحساب"
              >
                <div className="p-5 text-sm text-slate-400">
                  يتم تحميل العمليات من النظام الحقيقي
                </div>
              </Panel>

            </div>

            <div className="mb-6 rounded-2xl border border-white/10 bg-[#07101d] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">الأسواق</h2>
                <Link
                  href="/markets"
                  className="text-xs text-cyan-300"
                >
                  عرض الكل
                </Link>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {visibleMarkets.map((item, index) => (
                  <div
                    key={item.symbol || index}
                    className="rounded-xl border border-white/5 bg-white/[0.02] p-4"
                  >
                    <div className="text-sm font-bold">
                      {item.symbol || "—"}
                    </div>

                    <div className="mt-2 text-xl font-mono">
                      {item.current_price ??
                        item.lastPrice ??
                        item.price ??
                        "—"}
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                      {item.change24h ??
                        item.priceChangePercent ??
                        "—"}%
                    </div>
                  </div>
                ))}
              </div>
            </div>



          </div>
        </section>
      </div>
    </main>
  );
}

/* ARABTRADE_API_LAYER: /api/auth/me,/api/wallet,/api/notifications,/api/orders */