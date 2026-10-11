"use client";

import { useCallback, useEffect, useState } from "react";
import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";
import { Loader2, Package, RefreshCw, Wallet } from "lucide-react";

type Plan = { _id: string; name: string; description?: string; price: number; asset: string; durationDays: number };
type DepositBalance = { asset: string; available: number; locked: number };
type UserPlan = { _id: string; packageName: string; investedAmount: number; asset: string; durationDays: number; status: string; availableEarnings: number; lockedEarnings: number; totalRealizedEarnings: number; totalWithdrawn: number; firstWithdrawalStatus?: "available" | "pending" | "completed"; activatedAt: string; };
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

  const load = useCallback(async () => {
    try {
      await Promise.resolve();
      setLoading(true);
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
  useEffect(() => { void load(); }, [load]);

  async function action(kind: "activate" | "cancel" | "change", id: string) {
    if (kind === "cancel" && !window.confirm("إلغاء هذه الباقة سيحوّل 50% فقط من قيمة التفعيل إلى رصيد السحب العام. ستبقى الأرباح المحققة المتاحة في سجل الباقة. هل تريد المتابعة؟")) return;
    if (kind === "change" && (!activePlan || !window.confirm("تغيير الباقة سيضيف 50% من قيمة تفعيل الباقة الحالية إلى رصيد السحب العام، ويخصم سعر الباقة الجديدة من رصيد الإيداع. إذا لم يكف رصيد الإيداع فلن تتغير الباقة أو الأرصدة. هل تريد المتابعة؟"))) return;
    setBusy(id); setError(""); setMessage("");
    try {
      const body = kind === "cancel"
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

  const depositUsdt = data?.depositBalances.find((x) => x.asset === "USDT")?.available || 0;
  const activePlan = data?.userPackages.find((x) => x.status === "active");

  return <>
    <InternalNavbar />
    <div className="mx-auto flex max-w-[1700px]">
      <InternalSidebar />
      <main dir="rtl" className="min-w-0 flex-1 bg-[#050a13] p-4 text-white md:p-8">
        <section className="rounded-3xl border border-white/10 bg-gradient-to-l from-blue-500/[0.14] to-cyan-400/[0.04] p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><div className="text-[10px] font-bold tracking-[0.2em] text-cyan-300">ARAB TRADE</div><h1 className="mt-3 text-3xl font-black">الباقات</h1><p className="mt-2 text-sm leading-7 text-slate-400">فعّل باقة من رصيد الإيداع الخارجي، وتابع رصيد كل باقة بصورة منفصلة.</p></div>
            <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm"><RefreshCw size={16} className={loading ? "animate-spin" : ""}/>تحديث</button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-[#050a13]/70 p-5"><div className="flex items-center gap-2 text-xs text-slate-400"><Wallet size={16}/>رصيد الإيداع الخارجي</div><div className="mt-3 text-3xl font-black">{money(depositUsdt)} <span className="text-sm text-cyan-300">USDT</span></div><p className="mt-2 text-xs text-slate-500">منفصل عن رصيد السحب العام.</p></div>
            <div className="rounded-2xl border border-white/10 bg-[#050a13]/70 p-5"><div className="text-xs text-slate-400">الباقة النشطة</div><div className="mt-3 text-xl font-black">{activePlan?.packageName || "لا توجد باقة نشطة"}</div><p className="mt-2 text-xs text-slate-500">{activePlan ? "قيمة التفعيل " + money(activePlan.investedAmount) + " " + activePlan.asset : "اختر باقة متاحة."}</p></div>
          </div>
        </section>
        {message && <div role="status" className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] p-4 text-sm text-emerald-300">{message}</div>}
        {error && <div role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-400/[0.07] p-4 text-sm text-red-300">{error}</div>}
        <section className="mt-7"><h2 className="mb-4 text-xl font-black">الباقات المتاحة</h2>
          {loading ? <div className="p-10 text-center text-slate-500"><Loader2 className="mx-auto animate-spin"/></div> : !data?.packages.length ? <div className="rounded-2xl border border-white/10 p-8 text-center text-slate-500">لا توجد باقات مفعلة حاليًا.</div> :
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.packages.map((plan) => <article key={plan._id} className="rounded-2xl border border-white/10 bg-[#07101d] p-5"><div className="flex items-center justify-between"><Package size={22} className="text-cyan-300"/><span className="text-xs text-slate-500">{plan.durationDays} يوم</span></div><h3 className="mt-5 text-xl font-black">{plan.name}</h3><p className="mt-2 min-h-10 text-sm leading-6 text-slate-400">{plan.description || "باقة بمدة وقيمة تفعيل محددتين."}</p><div className="mt-4 text-3xl font-black">{money(plan.price)} <span className="text-sm text-cyan-300">{plan.asset}</span></div><button type="button" onClick={() => void action(activePlan ? "change" : "activate", plan._id)} disabled={Boolean(busy)} className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 font-black disabled:opacity-50">{busy === plan._id ? "جاري التنفيذ..." : activePlan ? activePlan.packageName === plan.name ? "تجديد / تفعيل نفس الباقة" : "التغيير إلى هذه الباقة" : "تفعيل من رصيد الإيداع"}</button></article>)}</div>}
        </section>
        <section className="mt-8 rounded-2xl border border-white/10 bg-[#07101d] p-5">
          <h2 className="text-xl font-black">باقاتي وأرصدة السحب</h2><p className="mt-2 text-xs leading-6 text-slate-500">رصيد كل باقة منفصل. من صفحة السحب اختر رصيد الباقة لسحب المبالغ المتاحة.</p>
          {loading ? <div className="py-8 text-center text-slate-500">جاري تحميل السجل...</div> : !data?.userPackages.length ? <div className="mt-4 p-8 text-center text-sm text-slate-500">لم تفعل أي باقة بعد.</div> : <div className="mt-4 space-y-3">{data.userPackages.map((item) => <div key={item._id} className="rounded-xl border border-white/10 bg-[#050a13] p-4"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="font-black">{item.packageName} <span className="text-xs text-slate-500">{item.status === "active" ? "نشطة" : "ملغاة"}</span></div><div className="mt-2 text-xs text-slate-500">التفعيل: {new Date(item.activatedAt).toLocaleDateString("ar-EG")} · قيمة التفعيل: {money(item.investedAmount)} {item.asset}</div></div>{item.status === "active" && <button type="button" onClick={() => void action("cancel", item._id)} disabled={Boolean(busy)} className="rounded-lg border border-red-400/20 px-3 py-2 text-xs text-red-300">{busy === item._id ? "جاري الإلغاء..." : "إلغاء الباقة (استرداد 50%)"}</button>}</div><div className="mt-3 rounded-lg border border-cyan-400/15 bg-cyan-400/[0.04] p-3 text-xs leading-6 text-cyan-100/80">{firstStatus(item) === "available" ? `الحد الأقصى لأول سحب من الباقة: ${money(item.investedAmount)} ${item.asset}.` : firstStatus(item) === "pending" ? "أول طلب سحب من هذه الباقة قيد المراجعة." : "تم حسم أول سحب؛ السحب اللاحق متاح من رصيد الباقة المحقق والمتاح وفق حدود المنصة."}</div><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{[["رصيد السحب المتاح", item.availableEarnings], ["سحب قيد المراجعة", item.lockedEarnings], ["العوائد المحققة", item.totalRealizedEarnings], ["إجمالي السحب", item.totalWithdrawn]].map(([label, amount]) => <div key={String(label)} className="rounded-lg border border-white/5 bg-white/[0.025] p-3"><div className="text-[11px] text-slate-500">{label}</div><div className="mt-1 font-black">{money(Number(amount))} {item.asset}</div></div>)}</div></div>)}</div>}
        </section>
        <section className="mt-7 rounded-2xl border border-white/10 bg-[#07101d] p-5">
          <h2 className="text-lg font-black">سجل حركات الباقات</h2>
          <p className="mt-1 text-xs text-slate-500">كل تفعيل واسترداد وعائد محقق وطلب سحب مسجل على حدة.</p>
          {!data?.packageLedger?.length ? (
            <div className="mt-4 rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">لا توجد حركات باقات مسجلة.</div>
          ) : (
            <div className="mt-4 space-y-2">
              {data.packageLedger.map((row) => (
                <div key={row._id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white/5 bg-[#050a13] p-4">
                  <div className="min-w-0">
                    <div className="font-bold">{row.userPackageId?.packageName || "الباقة"}</div>
                    <div className="mt-1 text-xs text-slate-500">{row.note || row.type}</div>
                    <div className="mt-1 text-[10px] text-slate-600">{new Date(row.createdAt).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}</div>
                  </div>
                  <div className={Number(row.amount) < 0 ? "font-black text-red-300" : "font-black text-emerald-300"}>
                    {Number(row.amount) > 0 ? "+" : ""}{money(row.amount)} {row.asset}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4 text-xs leading-6 text-amber-100/80">{data?.policy?.earningsNotice || "تُسجل العوائد المحققة فعليًا فقط، ولا تُنشأ أرباح يومية مضمونة تلقائيًا."} {data?.policy?.cancellationNotice}</section>
      </main>
    </div>
  </>;
}
