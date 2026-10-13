"use client";

import { useCallback, useEffect, useState } from "react";
import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";
import { Loader2, RefreshCw, Clock3, Gift } from "lucide-react";

type Plan = { _id: string; name: string; description?: string; price: number; asset: string; durationDays: number; dailyProfit?: number; minimumWithdrawal?: number };
type DepositBalance = { asset: string; available: number; locked: number };
type UserPlan = { _id: string; packageName: string; investedAmount: number; asset: string; durationDays: number; status: string; availableEarnings: number; lockedEarnings: number; totalRealizedEarnings: number; totalWithdrawn: number; firstWithdrawalStatus?: "available" | "pending" | "completed"; activatedAt: string; lastProfitAt?: string; dailyProfit?: number; minimumWithdrawal?: number; nextCollectAt?: string; collectWindowEndsAt?: string; collectWindowOpen?: boolean; };
type LedgerRow = { _id: string; type: string; asset: string; amount: number; note?: string; createdAt: string; userPackageId?: { packageName?: string } | null };
type Data = { packages: Plan[]; depositBalances: DepositBalance[]; userPackages: UserPlan[]; packageLedger?: LedgerRow[]; policy?: { earningsNotice?: string; cancellationNotice?: string } };
const money = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 }).format(Number(n || 0));
const firstStatus = (item: UserPlan) => item.firstWithdrawalStatus === "pending" ? "pending" : Number(item.totalWithdrawn || 0) > 0 ? "completed" : (item.firstWithdrawalStatus || "available");

export default function UserPackagesPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [clockNow, setClockNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/packages", { credentials: "include", cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "تعذر تحميل الباقات");
      setData(json as Data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل الباقات");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(() => { void load(); });
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function action(kind: "activate" | "cancel" | "change" | "collect", id: string) {
    if (kind === "cancel" && !window.confirm("إلغاء هذه الباقة سيحوّل 50% فقط من قيمة التفعيل إلى رصيد USDT المتاح في المحفظة الفورية. ستبقى الأرباح المحققة المتاحة في سجل الباقة. هل تريد المتابعة؟")) return;
    if (kind === "change" && (!activePlan || !window.confirm("تغيير الباقة سيضيف 50% من قيمة تفعيل الباقة الحالية إلى رصيد السحب الخاص بهذه الباقة، مع الاحتفاظ بأرباحها المجمعة فيها. وسيُخصم سعر الباقة الجديدة من رصيد الإيداع. إذا لم يكفِ رصيد الإيداع فلن تتغير الباقة أو الأرصدة. هل تريد المتابعة؟"))) return;
    setBusy(id); setError(""); setMessage("");
    try {
      const body = kind === "collect"
        ? { action: kind, userPackageId: id }
        : kind === "cancel"
          ? { action: kind, userPackageId: id }
          : kind === "change"
            ? { action: kind, packageId: id, userPackageId: activePlan?._id }
            : { action: kind, packageId: id };
      const res = await fetch("/api/packages", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "تعذر إتمام العملية");
      setMessage(json.message || "تمت العملية بنجاح");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إتمام العملية");
    } finally { setBusy(""); }
  }

  const depositUsdt = data?.depositBalances
    .filter((x) => String(x.asset || "").trim().toUpperCase() === "USDT")
    .reduce((sum, x) => sum + Number(x.available || 0), 0) || 0;
  const activePlan = data?.userPackages.find((x) => x.status === "active");

  return <>
    <InternalNavbar />
    <div className="mx-auto flex max-w-[1700px]">
      <InternalSidebar />
      <main dir="rtl" className="min-w-0 flex-1 bg-[#050a13] p-4 text-white md:p-8">
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#07101d] px-4 py-3">
          <div><h1 className="text-xl font-black">الباقات</h1><p className="mt-1 text-xs text-slate-400">الرصيد المتاح للتفعيل: <strong className="text-cyan-200">{money(depositUsdt)} USDT</strong> · الباقة الحالية: <strong className="text-white">{activePlan?.packageName || "لا توجد"}</strong></p></div>
          <button type="button" onClick={() => { setLoading(true); setError(""); void load(); }} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs"><RefreshCw size={14} className={loading ? "animate-spin" : ""}/>تحديث</button>
        </section>
        {message && <div role="status" className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] p-4 text-sm text-emerald-300">{message}</div>}
        {error && <div role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-400/[0.07] p-4 text-sm text-red-300">{error}</div>}
        {activePlan && (() => {
          const scheduledNextAt = activePlan.nextCollectAt ? new Date(activePlan.nextCollectAt).getTime() : 0;
          const scheduledEndsAt = activePlan.collectWindowEndsAt ? new Date(activePlan.collectWindowEndsAt).getTime() : 0;
          const cycleMs = 24 * 60 * 60 * 1000;
          const skippedCycles = clockNow > scheduledEndsAt ? Math.floor((clockNow - scheduledEndsAt) / cycleMs) + 1 : 0;
          const nextAt = scheduledNextAt + skippedCycles * cycleMs;
          const endsAt = nextAt + 30 * 60 * 1000;
          const windowOpen = clockNow >= nextAt && clockNow <= endsAt;
          const formatRemaining = (milliseconds: number) => {
            const total = Math.max(0, Math.floor(milliseconds / 1000));
            const hours = Math.floor(total / 3600).toString().padStart(2, "0");
            const minutes = Math.floor((total % 3600) / 60).toString().padStart(2, "0");
            const seconds = (total % 60).toString().padStart(2, "0");
            return hours + ":" + minutes + ":" + seconds;
          };
          return <section className="mt-5 rounded-xl border border-cyan-300/20 bg-[#07101d] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="flex items-center gap-2 text-base font-black"><Clock3 size={17} className="text-cyan-300"/>دورة أرباح باقتك: {activePlan.packageName}</h2>
                
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-center">
                <div className="text-[11px] text-slate-400">{windowOpen ? "الوقت المتبقي للجمع" : "الوقت المتبقي لفتح الجمع"}</div>
                <div className="mt-1 font-mono text-xl font-black text-cyan-200">{windowOpen ? formatRemaining(endsAt - clockNow) : formatRemaining(nextAt - clockNow)}</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-black/20 p-3">
              <div><div className="text-xs text-slate-400">الربح اليومي</div><div className="mt-1 text-lg font-black text-emerald-200">{money(Number(activePlan.dailyProfit || 0))} {activePlan.asset}</div><div className="mt-1 text-[11px] text-slate-500">يضاف إلى رصيد سحب هذه الباقة فقط.</div><div className="mt-2 text-xs text-slate-400">الحد الأدنى للسحب من الباقة: <strong className="text-white">{money(Number(activePlan.minimumWithdrawal ?? 100))} USDT</strong></div></div>
              <button type="button" onClick={() => void action("collect", activePlan._id)} disabled={!windowOpen || Boolean(busy)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-3 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"><Gift size={16}/>{busy === activePlan._id ? "جاري الجمع..." : windowOpen ? "جمع الأرباح" : "الجمع غير متاح الآن"}</button>
            </div>
            {windowOpen && <p className="mt-3 text-xs font-bold text-amber-200">فرصة الجمع مفتوحة الآن — تنتهي خلال {formatRemaining(endsAt - clockNow)}.</p>}
          </section>;
        })()}
        <section className="mt-5"><h2 className="mb-3 text-base font-black">الباقات المتاحة</h2>
          {loading ? <div className="p-8 text-center text-slate-500"><Loader2 className="mx-auto animate-spin"/></div> : !data?.packages.length ? <div className="rounded-xl border border-white/10 p-6 text-center text-slate-500">لا توجد باقات مفعلة حاليًا.</div> :
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{data.packages.map((plan) => <article key={plan._id} className="flex flex-col rounded-xl border border-white/10 bg-[#07101d] p-4">
              <div className="flex items-center justify-between gap-2"><h3 className="text-base font-black">{plan.name}</h3><span className="rounded-md bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-200">تفعيل دائم</span></div>
              <div className="mt-3 text-2xl font-black">{money(plan.price)} <span className="text-xs text-cyan-300">{plan.asset}</span></div>
              <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3 text-xs text-slate-400">
                <div className="flex justify-between gap-2"><span>الربح اليومي</span><strong className="text-emerald-200">{money(Number(plan.dailyProfit || 0))} {plan.asset}</strong></div>
                <div className="flex justify-between gap-2"><span>الحد الأدنى للسحب</span><strong className="text-white">{money(Number(plan.minimumWithdrawal ?? 100))} USDT</strong></div>
              </div>
              <button type="button" onClick={() => void action(activePlan ? "change" : "activate", plan._id)} disabled={Boolean(busy) || activePlan?.packageName === plan.name} className="mt-4 w-full rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50">{busy === plan._id ? "جاري التنفيذ..." : activePlan?.packageName === plan.name ? "تم التفعيل" : activePlan ? "التغيير إلى هذه الباقة" : "تفعيل الباقة"}</button>
            </article>)}</div>}
        </section>

      </main>
    </div>
  </>;
}
