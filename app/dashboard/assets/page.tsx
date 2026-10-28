"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";
import {
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  TrendingUp,
  History,
  RefreshCw,
  Eye,
  EyeOff,
  ChevronLeft,
} from "lucide-react";

type WalletBalance = {
  asset: string;
  available: number;
  locked: number;
  total: number;
  priceUsd: number;
  valueUsd: number;
};

type SplitBalance = { asset: string; available: number; locked: number };

type WalletData = {
  type: string;
  balances: WalletBalance[];
  totalAvailable: number;
  totalLocked: number;
  totalBalance: number;
  totalAvailableUsd: number;
  totalLockedUsd: number;
  totalBalanceUsd: number;
  totalAccountBalanceUsd?: number;
  totalAccountAvailableUsd?: number;
  totalAccountLockedUsd?: number;
};

type TransactionItem = {
  id: string;
  type: string;
  amount: number;
  asset: string;
  priceUsd: number;
  valueUsd: number;
  balanceBefore: number | null;
  balanceAfter: number | null;
  status: string;
  description: string;
  createdAt: string;
};

function money(value: number, maximumFractionDigits = 8) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits,
  });
}

function assetAmount(value: number) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 12,
  });
}

function transactionTitle(type: string) {
  switch (type) {
    case "deposit":
      return "إيداع";
    case "withdraw":
      return "سحب";
    case "withdraw_rejected":
      return "رفض سحب";
    case "package_activation":
      return "تفعيل باقة";
    case "collect":
      return "ربح يومي";
    case "admin_credit":
      return "إضافة من الإدارة";
    case "admin_debit":
      return "خصم من الإدارة";
    case "referral":
    case "referral_commission":
      return "عمولة إحالة";
    case "transfer":
      return "تحويل بين المحافظ";
    case "trade":
      return "عملية تداول";
    case "fee":
    case "liquidation_fee":
    case "margin_interest":
      return "رسوم تداول";
    case "reward":
      return "مكافأة";
    case "adjustment":
      return "تسوية رصيد";
    case "margin_open":
      return "فتح مركز هامش";
    case "margin_close":
      return "إغلاق مركز هامش";
    case "margin_liquidation":
      return "تصفية مركز هامش";
    case "insurance_fund_credit":
      return "إضافة لصندوق التأمين";
    case "insurance_fund_debit":
      return "خصم من صندوق التأمين";
    case "bad_debt":
      return "دين مستحق";
    default:
      return "حركة مالية";
  }
}

function transactionSign(amount: number) {
  return Number(amount) >= 0 ? "+" : "-";
}

export default function WalletPage() {
  const [wallet, setWallet] = useState<WalletData>({
    type: "spot",
    balances: [],
    totalAvailable: 0,
    totalLocked: 0,
    totalBalance: 0,
    totalAvailableUsd: 0,
    totalLockedUsd: 0,
    totalBalanceUsd: 0,
    totalAccountBalanceUsd: 0,
    totalAccountAvailableUsd: 0,
    totalAccountLockedUsd: 0,
  });

  const [depositBalances, setDepositBalances] = useState<SplitBalance[]>([]);
  const [generalWithdrawalBalance, setGeneralWithdrawalBalance] = useState<number | null>(null);

  const [transactions, setTransactions] = useState<
    TransactionItem[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);
  const [error, setError] = useState("");

  async function loadWallet(showSpinner = true) {
    try {
      if (showSpinner) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError("");

      const [response, withdrawalBalanceResponse] = await Promise.all([
        fetch("/api/wallet", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/withdrawals/balance", {
          credentials: "include",
          cache: "no-store",
        }).catch(() => null),
      ]);

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.message ||
            "تعذر تحميل بيانات المحفظة"
        );
      }

      setWallet(data.wallet);
      setDepositBalances(Array.isArray(data.depositBalances) ? data.depositBalances : []);
      setTransactions(data.transactions || []);

      if (withdrawalBalanceResponse?.ok) {
        try {
          const withdrawalData = await withdrawalBalanceResponse.json();
          const amount = Number(
            withdrawalData?.generalWithdrawalBalance ?? withdrawalData?.breakdown?.generalAvailable
          );
          if (Number.isFinite(amount) && amount >= 0) {
            setGeneralWithdrawalBalance(amount);
          }
        } catch {
          // Keep the last known general withdrawal balance.
        }
      }
    } catch (error: any) {
      setError(
        error?.message ||
          "تعذر تحميل بيانات المحفظة"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadWallet();

    const timer = window.setInterval(() => {
      void loadWallet(false);
    }, 10000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const displayedBalance = hideBalance
    ? "••••••••"
    : money(wallet.totalAccountBalanceUsd ?? wallet.totalBalanceUsd);

  const displayMoney = (value: number, digits = 2) =>
    hideBalance ? "••••••" : money(value, digits);

  const displayAssetAmount = (value: number) =>
    hideBalance ? "••••••" : assetAmount(value);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050a13]">
        <InternalNavbar />

        <div
          className="flex min-h-[calc(100vh-4rem)]"
          dir="rtl"
        >
          <InternalSidebar />

          <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
            <div className="mx-auto max-w-7xl space-y-6">
              <div className="h-12 w-48 animate-pulse rounded-xl bg-white/5" />

              <div className="h-64 animate-pulse rounded-3xl bg-white/[0.03]" />

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-32 animate-pulse rounded-2xl bg-white/[0.03]"
                  />
                ))}
              </div>

              <div className="h-96 animate-pulse rounded-3xl bg-white/[0.03]" />
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050a13]">
      <InternalNavbar />

      <div
        className="flex min-h-[calc(100vh-4rem)]"
        dir="rtl"
      >
        <InternalSidebar />

        <main className="min-w-0 flex-1 text-white">
          <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">

            {/* Header */}
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300">
                    <Wallet size={21} />
                  </div>

                  <div>
                    <h1 className="text-2xl font-black">
                      المحفظة
                    </h1>

                    <p className="mt-1 text-xs text-slate-500">
                      إدارة رصيدك وحركاتك المالية
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void loadWallet(false)}
                disabled={refreshing}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
              >
                <RefreshCw
                  size={16}
                  className={
                    refreshing
                      ? "animate-spin"
                      : ""
                  }
                />

                تحديث
              </button>
            </div>

            {error && (
              <div className="mb-6 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {/* Main Balance */}
            <section className="relative mb-6 overflow-hidden rounded-3xl border border-blue-400/10 bg-gradient-to-br from-blue-600/15 via-[#08111e] to-cyan-500/[0.04] p-6 sm:p-8">
              <div className="absolute -left-20 -top-20 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />

              <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">

                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm text-slate-400">
                    <span>إجمالي أصول المحافظ</span>

                    <button
                      type="button"
                      onClick={() =>
                        setHideBalance((v) => !v)
                      }
                      className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/5 hover:text-white"
                      aria-label="إخفاء أو إظهار الرصيد"
                    >
                      {hideBalance ? (
                        <Eye size={15} />
                      ) : (
                        <EyeOff size={15} />
                      )}
                    </button>
                  </div>

                  <div className="flex items-end gap-3">
                    <span className="text-4xl font-black tracking-tight sm:text-5xl">
                      {displayedBalance}
                    </span>

                    <span className="mb-1 text-lg font-bold text-slate-500">
                      USD
                    </span>
                  </div>

                  <p className="mt-3 text-xs text-slate-500">
                    هذا الإجمالي يشمل رصيد التداول والإيداع الخارجي؛ رصيد الإيداع الخارجي معروض بشكل منفصل أدناه.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:flex">
                  <Link
                    href="/dashboard/assets/deposit"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-400"
                  >
                    <ArrowDownToLine size={17} />
                    إيداع
                  </Link>


                  <Link
                    href="/protrade"
                    className="col-span-2 inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3.5 text-sm font-bold text-slate-200 transition hover:border-blue-400/20 hover:bg-blue-500/10 sm:col-span-1"
                  >
                    <ArrowLeftRight size={17} />
                    تداول
                  </Link>
                </div>
              </div>
            </section>

            {/* Separate funding sources: external deposits vs earnings/refunds from inside the platform */}
            <section className="mb-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-sky-400/20 bg-sky-500/[0.06] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-bold text-sky-200">رصيد الإيداع الخارجي</div>
                  {depositBalances.some((item) => String(item.asset).toUpperCase() === "USDT" && Number(item.available || 0) > 0) && (
                    <Link href="/dashboard/withdrawals?source=deposit" className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-300/[0.07] px-3 py-2 text-xs font-bold text-cyan-200 transition hover:bg-cyan-300/[0.12]">
                      <ArrowUpFromLine size={15} />
                      سحب رصيد USDT
                    </Link>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-400">الأموال التي أودعتها من خارج الموقع فقط. تُستخدم لتفعيل الباقات، وتُعرض منفصلة عن رصيد التداول. يمكن سحب رصيد USDT من خيار رصيد الإيداع داخل السحب العام فقط.</p>
                <div className="mt-4 space-y-2">
                  {depositBalances.length ? depositBalances.map((item) => (
                    <div key={item.asset} className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-3 py-2 text-sm">
                      <span className="font-bold">{item.asset}</span>
                      <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-left">
                        <span>{displayAssetAmount(item.available)} <span className="text-slate-500">متاح</span></span>
                        <span>{displayAssetAmount(item.locked)} <span className="text-slate-500">محجوز</span></span>
                      </div>
                    </div>
                  )) : <p className="text-sm text-slate-500">لا يوجد رصيد إيداع خارجي متاح حاليًا.</p>}
                </div>
              </div>
            </section>

            {/* Stats */}
            <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#08111e] to-[#0b1628] p-6">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    إجمالي أصول الحساب
                  </span>
                  <Wallet size={17} className="text-cyan-300" />
                </div>

                <div className="text-2xl font-black">
                  {displayMoney(wallet.totalAccountBalanceUsd ?? wallet.totalBalanceUsd)}
                  <span className="mr-2 text-xs text-slate-500">
                    USD
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#08111e] to-[#0b1628] p-6">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    السحب العام
                  </span>
                  <ArrowUpFromLine size={17} className="text-emerald-300" />
                </div>

                <div className="text-2xl font-black">
                  {generalWithdrawalBalance === null
                    ? (loading ? "..." : "—")
                    : displayMoney(generalWithdrawalBalance)}
                  <span className="mr-2 text-xs text-slate-500">
                    USDT
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#08111e] to-[#0b1628] p-6">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    إجمالي المحجوز
                  </span>
                  <History size={17} className="text-amber-300" />
                </div>

                <div className="text-2xl font-black">
                  {displayMoney(wallet.totalAccountLockedUsd ?? wallet.totalLockedUsd)}
                  <span className="mr-2 text-xs text-slate-500">
                    USD
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#08111e] to-[#0b1628] p-6">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    عدد الأصول
                  </span>
                  <TrendingUp size={17} className="text-blue-300" />
                </div>

                <div className="text-2xl font-black">
                  {wallet.balances.length}
                  <span className="mr-2 text-xs text-slate-500">
                    أصل
                  </span>
                </div>
              </div>

            </section>

            {/* Asset */}
            <section className="mb-6 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#08111e] to-[#0b1628]">

              <div className="flex flex-col gap-3 border-b border-white/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-bold">
                    الأصول
                  </h2>

                  <p className="mt-1 text-xs text-slate-500">
                    أرصدة الأصول الموجودة في محفظتك وقيمتها الحالية بالدولار
                  </p>
                </div>

                <span className="rounded-full border border-blue-400/10 bg-blue-500/10 px-3 py-1 text-[11px] font-bold text-cyan-300">
                  {wallet.balances.length} {wallet.balances.length === 1 ? "أصل" : "أصول"}
                </span>
              </div>

              {wallet.balances.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">

                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.03] text-slate-600">
                    <Wallet size={23} />
                  </div>

                  <h3 className="text-sm font-bold text-slate-300">
                    لا توجد أصول في المحفظة
                  </h3>

                  <p className="mt-2 text-xs text-slate-600">
                    ستظهر العملات هنا بعد إضافة رصيد إلى المحفظة.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">

                  <table className="w-full min-w-[860px] text-right">

                    <thead>
                      <tr className="border-b border-white/5 text-xs text-slate-500">

                        <th className="px-6 py-4 font-medium">
                          الأصل
                        </th>

                        <th className="px-6 py-4 font-medium">
                          الرصيد
                        </th>

                        <th className="px-6 py-4 font-medium">
                          المتاح
                        </th>

                        <th className="px-6 py-4 font-medium">
                          المعلق
                        </th>

                        <th className="px-6 py-4 font-medium">
                          القيمة بالدولار
                        </th>

                        <th className="px-6 py-4 text-left font-medium">
                          الإجراءات
                        </th>

                      </tr>
                    </thead>

                    <tbody>
                      {wallet.balances.map((item) => (
                        <tr
                          key={item.asset}
                          className="border-b border-white/5 transition hover:bg-cyan-400/[0.04] last:border-b-0"
                        >

                          <td className="px-6 py-5">
                            <div className="flex items-center gap-3">

                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/15 font-black text-blue-300">
                                {item.asset === "USDT"
                                  ? "$"
                                  : item.asset.slice(0, 2)}
                              </div>

                              <div>
                                <div className="text-sm font-bold">
                                  {item.asset}
                                </div>

                                <div className="mt-1 text-[11px] text-slate-500">
                                  Spot Wallet
                                </div>
                              </div>

                            </div>
                          </td>

                          <td className="px-6 py-5">
                            <div className="font-mono text-sm font-bold">
                              {displayAssetAmount(item.total)} {item.asset}
                            </div>

                            <div className="mt-1 text-[11px] text-slate-600">
                              السعر: ${displayMoney(item.priceUsd, 8)}
                            </div>
                          </td>

                          <td className="px-6 py-5">
                            <span className="font-mono text-sm text-slate-300">
                              {displayAssetAmount(item.available)} {item.asset}
                            </span>
                          </td>

                          <td className="px-6 py-5">
                            <span className="font-mono text-sm text-amber-300">
                              {displayAssetAmount(item.locked)} {item.asset}
                            </span>
                          </td>

                          <td className="px-6 py-5">
                            <div className="font-mono text-sm font-bold text-cyan-300">
                              ${displayMoney(item.valueUsd, 2)}
                            </div>
                          </td>

                          <td className="px-6 py-5 text-left">
                            <div className="flex justify-end gap-2">

                              <Link
                                href="/dashboard/assets/deposit"
                                className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-blue-500/10 hover:text-cyan-300"
                              >
                                إيداع
                              </Link>


                            </div>
                          </td>

                        </tr>
                      ))}
                    </tbody>

                  </table>

                </div>
              )}

            </section>

            {/* Transactions */}
            <section className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#08111e] to-[#0b1628]">

              <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
                <div>
                  <h2 className="text-base font-bold">
                    آخر الحركات
                  </h2>

                  <p className="mt-1 text-xs text-slate-500">
                    أحدث العمليات التي أثرت على رصيدك
                  </p>
                </div>

                <Link
                  href="/dashboard/account/statement"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-300 transition hover:text-white"
                >
                  عرض الكل
                  <ChevronLeft size={14} />
                </Link>
              </div>

              {transactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.03] text-slate-600">
                    <History size={23} />
                  </div>

                  <h3 className="text-sm font-bold text-slate-300">
                    لا توجد حركات مالية حتى الآن
                  </h3>

                  <p className="mt-2 text-xs text-slate-600">
                    ستظهر عمليات الإيداع والأرباح هنا.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {transactions.map((item) => {
                    const positive = Number(item.amount) >= 0;

                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-4 px-6 py-5 transition hover:bg-cyan-400/[0.04]"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                              positive
                                ? "bg-emerald-500/10 text-emerald-300"
                                : "bg-red-500/10 text-red-300"
                            }`}
                          >
                            {positive ? (
                              <ArrowDownToLine size={17} />
                            ) : (
                              <ArrowUpFromLine size={17} />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-200">
                              {transactionTitle(
                                item.type
                              )}
                            </div>

                            <div className="mt-1 truncate text-[11px] text-slate-500">
                              {item.description ||
                                new Date(
                                  item.createdAt
                                ).toLocaleString("ar-EG")}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 text-left">
                          <div
                            className={`font-mono text-sm font-bold ${
                              positive
                                ? "text-emerald-300"
                                : "text-red-300"
                            }`}
                            dir="ltr"
                          >
                            {transactionSign(item.amount)}
                            {displayAssetAmount(Math.abs(item.amount))}
                            <span className="mr-1 text-[10px] text-slate-500">
                              {item.asset}
                            </span>
                          </div>

                          <div className="mt-1 text-[10px] text-cyan-400/70">
                            ≈ ${displayMoney(item.valueUsd, 2)} USD
                          </div>

                          <div className="mt-1 text-[10px] text-slate-600">
                            {new Date(
                              item.createdAt
                            ).toLocaleString(
                              "ar-EG"
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

          </div>
        </main>
      </div>
    </div>
  );
}