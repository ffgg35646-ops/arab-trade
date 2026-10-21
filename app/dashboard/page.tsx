"use client";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

export default function DashboardPage() {
  const [user, setUser] = useState<UserData | null>(null);
  const [markets, setMarkets] = useState<MarketItem[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [userRes, marketRes] = await Promise.all([
          fetch("/api/auth/me", { cache: "no-store" }),
          fetch("/api/market", { cache: "no-store" }),
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

      } catch (error) {
        console.error("Dashboard load error:", error);
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

  return (
    <main dir="rtl" className="min-h-screen bg-[#050a13] text-white">
      

      <div className="mx-auto flex max-w-[1700px]">
        

        <section className="min-w-0 flex-1">
          <div className="p-4 md:p-6 lg:p-8">
            <div className="mb-6 flex flex-col justify-between gap-5 rounded-2xl border border-white/10 bg-[#07101d] p-5 md:flex-row md:items-center">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-400/10">
                  <UserRound size={27} className="text-cyan-300" />
                </div>

                <div>
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-xl font-bold">
                        {user?.name || "حسابي"}
                      </h1>

                      {user ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs ${
                              user.isVerified
                                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                                : "border-red-400/20 bg-red-400/10 text-red-300"
                            }`}
                          >
                            {user.isVerified ? "الحساب موثق" : "الحساب غير موثق"}
                          </span>
                          {!user.isVerified && (
                            <Link
                              href="/dashboard/account/verification"
                              className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-cyan-400"
                            >
                              وثّق الآن
                            </Link>
                          )}
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
                      <span>UID: {user?.id || "—"}</span>
                    </div>
                  </>
                </div>
              </div>

            </div>

            <div className="mb-6 grid gap-3 sm:grid-cols-2">
              <Link
                href="/dashboard/assets/deposit"
                className="group flex items-center gap-3 rounded-xl border border-white/10 bg-[#07101d] p-4 transition hover:border-cyan-400/25 hover:bg-white/[0.025]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300">
                  <ArrowDownToLine size={20} />
                </span>
                <span>
                  <span className="block text-sm font-bold text-white">إيداع</span>
                  <span className="mt-1 block text-xs text-slate-500">إيداع رصيد إلى حسابك</span>
                </span>
              </Link>
              <Link
                href="/dashboard/withdrawals"
                className="group flex items-center gap-3 rounded-xl border border-white/10 bg-[#07101d] p-4 transition hover:border-cyan-400/25 hover:bg-white/[0.025]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300">
                  <ArrowUpFromLine size={20} />
                </span>
                <span>
                  <span className="block text-sm font-bold text-white">سحب</span>
                  <span className="mt-1 block text-xs text-slate-500">إدارة طلبات السحب</span>
                </span>
              </Link>
            </div>

            <div className="mb-6 rounded-2xl border border-white/10 bg-[#07101d] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">الأسواق</h2>
                <Link
                  href="/dashboard/markets"
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