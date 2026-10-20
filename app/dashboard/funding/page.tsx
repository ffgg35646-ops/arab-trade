"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";
import {
  ArrowLeftRight,
  CircleDollarSign,
  Clock3,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import { Frame } from "@/components/dashboard/AccountUI";

type FundingBalance = {
  asset: string;
  available: number;
  locked: number;
  total: number;
  priceUsd?: number;
  valueUsd?: number;
};

type WalletResponse = {
  success?: boolean;
  message?: string;
  funding?: { balances?: FundingBalance[]; totalBalanceUsd?: number };
  wallet?: {
    fundingTotalUsd?: number;
    fundingAvailableUsd?: number;
    fundingLockedUsd?: number;
  };
};

type TransferRecord = {
  id: string;
  asset: string;
  amount: number;
  from: "spot" | "funding";
  to: "spot" | "funding";
  status: "completed" | "failed";
  createdAt: string;
};

type TransferResponse = {
  success?: boolean;
  message?: string;
  transfers?: TransferRecord[];
};

function amount(value: unknown, maximumFractionDigits = 8) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("en-US", { maximumFractionDigits })
    : "—";
}

function usdt(value: unknown) {
  return amount(value, 2) + " USDT";
}

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("ar-EG", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function walletName(value: "spot" | "funding") {
  return value === "spot" ? "التداول الفوري" : "التمويل";
}

export default function FundingPage() {
  const [balances, setBalances] = useState<FundingBalance[]>([]);
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [totalUsd, setTotalUsd] = useState(0);
  const [availableUsd, setAvailableUsd] = useState(0);
  const [lockedUsd, setLockedUsd] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [transferError, setTransferError] = useState("");

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await fetch("/api/wallet?mode=live", {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as WalletResponse;

      if (!response.ok || data.success === false) {
        throw new Error(data.message || "تعذر تحميل رصيد حساب التمويل.");
      }

      const walletBalances = Array.isArray(data.funding?.balances)
        ? data.funding.balances
        : [];
      setBalances(walletBalances);
      setTotalUsd(Number(data.wallet?.fundingTotalUsd ?? data.funding?.totalBalanceUsd ?? 0));
      setAvailableUsd(Number(data.wallet?.fundingAvailableUsd ?? 0));
      setLockedUsd(Number(data.wallet?.fundingLockedUsd ?? 0));
      setError("");

      const transfersResponse = await fetch("/api/transfers?wallet=funding&limit=10", {
        credentials: "include",
        cache: "no-store",
      }).catch(() => null);

      if (!transfersResponse) {
        setTransfers([]);
        setTransferError("تعذر تحميل سجل التحويلات حاليًا.");
      } else {
        const transfersData = (await transfersResponse.json().catch(() => ({}))) as TransferResponse;
        if (transfersResponse.ok && transfersData.success !== false && Array.isArray(transfersData.transfers)) {
          setTransfers(transfersData.transfers);
          setTransferError("");
        } else {
          setTransfers([]);
          setTransferError(transfersData.message || "تعذر تحميل سجل التحويلات.");
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "حدث خطأ أثناء تحميل حساب التمويل.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const activeBalances = useMemo(
    () => balances.filter((balance) => Number(balance.total || 0) !== 0),
    [balances]
  );

  return (
    <>
      <InternalNavbar />
      <div className="mx-auto flex max-w-[1700px]">
        <InternalSidebar />
        <div className="min-w-0 flex-1">
          <Frame
            title="التمويل"
            description="عرض رصيد حساب التمويل الفعلي، والأصول المتاحة والمحجوزة، وسجل التحويلات المرتبطة به."
            icon={CircleDollarSign}
          >
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-3xl text-xs leading-6 text-slate-400">
                  هذا حساب داخلي لتحريك الأصول بين التمويل والتداول الفوري. لا تُعرض أي أرصدة تقديرية بدلًا من البيانات المحفوظة في المحفظة.
                </p>
                <button
                  type="button"
                  onClick={() => void load(true)}
                  disabled={refreshing}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-xs font-bold text-slate-200 transition hover:bg-white/5 disabled:opacity-50"
                >
                  <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                  تحديث الأرصدة
                </button>
              </div>

              {error ? (
                <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-300">
                  {error}
                  <div className="mt-3">
                    <Link href="/login" className="font-bold underline underline-offset-4">تسجيل الدخول</Link>
                  </div>
                </div>
              ) : null}

              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">إجمالي قيمة حساب التمويل</span>
                    <CircleDollarSign size={18} className="text-cyan-300" />
                  </div>
                  <div className="mt-4 text-2xl font-black text-white">{loading ? "…" : usdt(totalUsd)}</div>
                  <p className="mt-2 text-[11px] text-slate-500">القيمة المجمعة للأصول حسب أسعار التحويل المتاحة.</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">متاح</span>
                    <WalletCards size={18} className="text-emerald-300" />
                  </div>
                  <div className="mt-4 text-2xl font-black text-white">{loading ? "…" : usdt(availableUsd)}</div>
                  <p className="mt-2 text-[11px] text-slate-500">قيمة الأصول المتاحة حاليًا للتحويل.</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">محجوز</span>
                    <Clock3 size={18} className="text-amber-300" />
                  </div>
                  <div className="mt-4 text-2xl font-black text-white">{loading ? "…" : usdt(lockedUsd)}</div>
                  <p className="mt-2 text-[11px] text-slate-500">قيمة الأصول المقفلة في حساب التمويل.</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">الأصول ذات الرصيد</span>
                    <WalletCards size={18} className="text-cyan-300" />
                  </div>
                  <div className="mt-4 text-2xl font-black text-white">{loading ? "…" : activeBalances.length.toLocaleString("en-US")}</div>
                  <p className="mt-2 text-[11px] text-slate-500">عدد الأصول التي لها رصيد غير صفري.</p>
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-[#07101d]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5">
                  <div>
                    <h2 className="font-black text-white">أرصدة حساب التمويل</h2>
                    <p className="mt-1 text-xs text-slate-500">الأرصدة تُقرأ مباشرة من واجهة المحفظة.</p>
                  </div>
                  <Link href="/dashboard/assets/transfer" className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-xs font-black text-[#06111b] transition hover:bg-cyan-300">
                    <ArrowLeftRight size={14} />
                    تحويل بين الحسابات
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[650px] text-right text-sm">
                    <thead className="text-xs text-slate-500">
                      <tr>
                        <th className="px-5 py-4 font-medium">الأصل</th>
                        <th className="px-5 py-4 font-medium">المتاح</th>
                        <th className="px-5 py-4 font-medium">المحجوز</th>
                        <th className="px-5 py-4 font-medium">الإجمالي</th>
                        <th className="px-5 py-4 font-medium">القيمة التقريبية USDT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeBalances.map((balance) => (
                        <tr key={balance.asset} className="border-t border-white/5">
                          <td className="px-5 py-4 font-bold text-white">{balance.asset}</td>
                          <td className="px-5 py-4 font-mono text-slate-200">{amount(balance.available)}</td>
                          <td className="px-5 py-4 font-mono text-slate-400">{amount(balance.locked)}</td>
                          <td className="px-5 py-4 font-mono text-slate-200">{amount(balance.total)}</td>
                          <td className="px-5 py-4 font-mono text-cyan-200">{usdt(balance.valueUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!activeBalances.length ? (
                    <div className="px-5 py-10 text-center text-sm text-slate-500">
                      {loading ? "جارٍ تحميل الأرصدة…" : "لا توجد أصول في حساب التمويل حاليًا."}
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#07101d]">
                <div className="border-b border-white/10 p-5">
                  <h2 className="font-black text-white">آخر التحويلات المرتبطة بالتمويل</h2>
                  <p className="mt-1 text-xs text-slate-500">آخر 10 تحويلات فعلية بين حساب التمويل والتداول الفوري.</p>
                </div>
                {transferError ? (
                  <div role="status" className="px-5 py-4 text-xs text-amber-300">{transferError}</div>
                ) : null}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-right text-sm">
                    <thead className="text-xs text-slate-500">
                      <tr>
                        <th className="px-5 py-4 font-medium">التاريخ</th>
                        <th className="px-5 py-4 font-medium">من</th>
                        <th className="px-5 py-4 font-medium">إلى</th>
                        <th className="px-5 py-4 font-medium">المبلغ</th>
                        <th className="px-5 py-4 font-medium">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transfers.map((transfer) => (
                        <tr key={transfer.id} className="border-t border-white/5">
                          <td className="px-5 py-4 text-slate-400">{dateTime(transfer.createdAt)}</td>
                          <td className="px-5 py-4">{walletName(transfer.from)}</td>
                          <td className="px-5 py-4">{walletName(transfer.to)}</td>
                          <td className="px-5 py-4 font-mono text-white">{amount(transfer.amount)} {transfer.asset}</td>
                          <td className="px-5 py-4">
                            <span className={transfer.status === "completed" ? "text-emerald-300" : "text-rose-300"}>
                              {transfer.status === "completed" ? "مكتمل" : "فشل"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!transfers.length && !transferError ? (
                    <div className="px-5 py-10 text-center text-sm text-slate-500">
                      {loading ? "جارٍ تحميل سجل التحويلات…" : "لا توجد تحويلات مرتبطة بالتمويل حتى الآن."}
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/5">
                    <CircleDollarSign size={18} className="text-cyan-300" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white">ملاحظات التحويل</h2>
                    <p className="mt-2 text-xs leading-7 text-slate-400">
                      التحويل يغيّر الرصيد بين المحفظتين ولا يمثل إيداعًا خارجيًا أو تنفيذ صفقة. يعتمد تنفيذ التحويل على الرصيد المتاح والتحقق المطلوب للحساب.
                    </p>
                    <Link href="/dashboard/assets/transfer" className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-cyan-300 hover:text-cyan-200">
                      فتح صفحة التحويل <ArrowLeftRight size={14} />
                    </Link>
                  </div>
                </div>
              </section>
            </div>
          </Frame>
        </div>
      </div>
    </>
  );
}
