"use client";

import { useCallback, useEffect, useState } from "react";
import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";
import { Loader2, RefreshCw, Clock3, Gift } from "lucide-react";

type Plan = { _id: string; name: string; description?: string; price: number; asset: string; durationDays: number; dailyProfit?: number };
type DepositBalance = { asset: string; available: number; locked: number };
type UserPlan = { _id: string; packageId?: string; packageName: string; cancellationRefund?: number; cancelledAt?: string; investedAmount: number; asset: string; durationDays: number; status: string; availableEarnings: number; lockedEarnings: number; totalRealizedEarnings: number; activatedAt: string; lastProfitAt?: string; dailyProfit?: number; nextCollectAt?: string; collectWindowEndsAt?: string; collectWindowOpen?: boolean; };
type Data = { packages: Plan[]; depositBalances: DepositBalance[]; userPackages: UserPlan[]; policy?: { earningsNotice?: string; cancellationNotice?: string } };
const money = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 }).format(Number(n || 0));

export default function UserPackagesPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingChangePackageId, setPendingChangePackageId] = useState<string | null>(null);
  const [clockNow, setClockNow] = useState(0);
  // UI-only grace window: keep the collect button visually available for 30 minutes
  // after a successful collect, even if the refreshed API schedule points to tomorrow.
  const [collectUiWindows, setCollectUiWindows] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      // Use the same wallet endpoint as InternalNavbar for the displayed deposit balance.
      // Keep package/account data from /api/packages; do not merge balances or credit funds client-side.
      const [packagesRes, walletRes] = await Promise.all([
        fetch("/api/packages", { credentials: "include", cache: "no-store" }),
        fetch("/api/wallet", { credentials: "include", cache: "no-store" }),
      ]);
      const [packagesJson, walletJson] = await Promise.all([
        packagesRes.json(),
        walletRes.json(),
      ]);
      if (!packagesRes.ok || !packagesJson.success) {
        throw new Error(packagesJson.message || "تعذر تحميل الباقات");
      }
      const nextData = packagesJson as Data;
      if (walletRes.ok && walletJson?.success && Array.isArray(walletJson.depositBalances)) {
        nextData.depositBalances = walletJson.depositBalances;
      }
      setData(nextData);
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
    const initialTimer = window.setTimeout(() => setClockNow(Date.now()), 0);
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const now = Date.now();
    const saved: Record<string, number> = {};
    for (const plan of data?.userPackages ?? []) {
      if (plan.status !== "active") continue;
      const key = `arabTrade:collect-window-ui:${plan._id}`;
      const until = Number(window.localStorage.getItem(key) || 0);
      if (until > now) saved[plan._id] = until;
      else window.localStorage.removeItem(key);
    }
    setCollectUiWindows(saved);
  }, [data?.userPackages]);

  async function action(kind: "activate" | "cancel" | "change" | "collect", id: string, confirmed = false) {
    if (kind === "cancel" && !window.confirm("إلغاء هذه الباقة سيضيف 50% من قيمة التفعيل إلى رصيد أرباح هذه الباقة نفسها، وستبقى الأرباح المحققة في رصيدها. هل تريد المتابعة؟")) return;
    if (kind === "change") {
      if (!activePlan) return;
      if (!confirmed) {
        setPendingChangePackageId(id);
        return;
      }
    }
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
      if (kind === "collect") {
        const uiWindowEndsAt = Date.now() + 30 * 60 * 1000;
        setCollectUiWindows((previous) => ({ ...previous, [id]: uiWindowEndsAt }));
        try {
          window.localStorage.setItem(`arabTrade:collect-window-ui:${id}`, String(uiWindowEndsAt));
        } catch {
          // Button state still works for the current page if browser storage is unavailable.
        }
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إتمام العملية");
    } finally { setBusy(""); }
  }

  const depositUsdt = data?.depositBalances
    .filter((x) => String(x.asset || "").trim().toUpperCase() === "USDT")
    .reduce((sum, x) => sum + Number(x.available || 0), 0) || 0;
  const activePlan = data?.userPackages.find((x) => x.status === "active");

  // Show every package enabled by the admin; disabled packages are filtered by /api/packages.
  const visiblePackages = data?.packages ?? [];


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

        {pendingChangePackageId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" dir="rtl">
            <section
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="change-package-title"
              aria-describedby="change-package-description"
              className="w-full max-w-lg overflow-hidden rounded-2xl border border-cyan-300/20 bg-[#08111e] shadow-2xl shadow-black/50"
            >
              <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300/10 text-amber-200">
                  <span className="text-xl font-black">!</span>
                </div>
                <div>
                  <h2 id="change-package-title" className="text-base font-black text-white">تأكيد تغيير الباقة</h2>
                  <p className="mt-1 text-xs text-slate-400">يرجى مراجعة تفاصيل العملية قبل المتابعة.</p>
                </div>
              </div>
              <div id="change-package-description" className="px-5 py-5 text-sm leading-8 text-slate-200">
                تغيير الباقة سيضيف 50% من قيمة تفعيل الباقة الحالية إلى رصيد أرباح الباقة الحالية نفسها، وتظل الأرباح المجمعة فيها. وسيُخصم سعر الباقة الجديدة من رصيد الإيداع. إذا لم يكفِ رصيد الإيداع فلن تتغير الباقة أو الأرصدة. هل تريد المتابعة؟
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-white/10 bg-black/10 px-5 py-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setPendingChangePackageId(null)}
                  className="rounded-xl border border-white/10 px-5 py-2.5 text-sm font-bold text-slate-300 transition hover:bg-white/5 hover:text-white"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    const packageId = pendingChangePackageId;
                    if (!packageId) return;
                    setPendingChangePackageId(null);
                    void action("change", packageId, true);
                  }}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  تأكيد تغيير الباقة
                </button>
              </div>
            </section>
          </div>
        )}
        {activePlan && (() => {
          const scheduledNextAt = activePlan.nextCollectAt ? new Date(activePlan.nextCollectAt).getTime() : 0;
          const scheduledEndsAt = activePlan.collectWindowEndsAt ? new Date(activePlan.collectWindowEndsAt).getTime() : 0;
          const cycleMs = 24 * 60 * 60 * 1000;
          const skippedCycles = clockNow > scheduledEndsAt ? Math.floor((clockNow - scheduledEndsAt) / cycleMs) + 1 : 0;
          const nextAt = scheduledNextAt + skippedCycles * cycleMs;
          const endsAt = nextAt + 30 * 60 * 1000;
          const scheduledWindowOpen = clockNow >= nextAt && clockNow <= endsAt;
          const collectUiEndsAt = Number(collectUiWindows[activePlan._id] || 0);
          const recentCollectWindowOpen = clockNow > 0 && collectUiEndsAt > clockNow;
          const windowOpen = scheduledWindowOpen || recentCollectWindowOpen;
          const visibleWindowEndsAt = recentCollectWindowOpen && !scheduledWindowOpen ? collectUiEndsAt : endsAt;
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
              <button
                type="button"
                onClick={() => void action("cancel", activePlan._id)}
                disabled={Boolean(busy) || Number(activePlan.lockedEarnings || 0) > 0}
                className="rounded-lg border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-sm font-bold text-rose-200 transition hover:bg-rose-400/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {Number(activePlan.lockedEarnings || 0) > 0 ? "تعذّر الإلغاء أثناء حجز رصيد" : "إلغاء الباقة"}
              </button>
              <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-center">
                <div className="text-[11px] text-slate-400">{windowOpen ? "الوقت المتبقي للجمع" : "الوقت المتبقي لفتح الجمع"}</div>
                <div className="mt-1 font-mono text-xl font-black text-cyan-200">{windowOpen ? formatRemaining(visibleWindowEndsAt - clockNow) : formatRemaining(nextAt - clockNow)}</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-black/20 p-3">
              <div><div className="text-xs text-slate-400">الربح اليومي</div><div className="mt-1 text-lg font-black text-emerald-200">{money(Number(activePlan.dailyProfit || 0))} {activePlan.asset}</div><div className="mt-1 text-[11px] text-slate-500">يضاف إلى رصيد أرباح هذه الباقة فقط.</div></div>
              <button type="button" onClick={() => void action("collect", activePlan._id)} disabled={!windowOpen || Boolean(busy)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-3 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"><Gift size={16}/>{busy === activePlan._id ? "جاري الجمع..." : recentCollectWindowOpen ? "متاح الجمع الآن" : windowOpen ? "جمع الأرباح" : "الجمع غير متاح الآن"}</button>
            </div>
            {windowOpen && <p className="mt-3 text-xs font-bold text-amber-200">فرصة الجمع مفتوحة الآن — تنتهي خلال {formatRemaining(visibleWindowEndsAt - clockNow)}.</p>}
          </section>;
        })()}
        <section className="mt-5"><h2 className="mb-3 text-base font-black">الباقات المفعلة</h2>
          {loading ? <div className="p-8 text-center text-slate-500"><Loader2 className="mx-auto animate-spin"/></div> : !visiblePackages.length ? <div className="rounded-xl border border-white/10 p-6 text-center text-slate-500">لا توجد باقات مفعلة حاليًا.</div> :
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{visiblePackages.map((plan) => <article key={plan._id} className="flex flex-col rounded-xl border border-white/10 bg-[#07101d] p-4">
              <div className="flex items-center justify-between gap-2"><h3 className="text-base font-black">{plan.name}</h3><span className="rounded-md bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-200">تفعيل دائم</span></div>
              <div className="mt-3 text-2xl font-black">{money(plan.price)} <span className="text-xs text-cyan-300">{plan.asset}</span></div>
              <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3 text-xs text-slate-400">
                {plan.description && plan.description.replace(/\s+/g, " ").trim() !== "باقة تفعيل مستمرة دون انتهاء. رصيد التفعيل مستقل عن رصيد السحب، ويُضاف الربح اليومي المحدد من الإدارة. يمكن تعديل السعر والتفاصيل من لوحة الإدارة." && <p className="leading-5">{plan.description}</p>}
                <div className="flex justify-between gap-2"><span>الربح اليومي</span><strong className="text-emerald-200">{money(Number(plan.dailyProfit || 0))} {plan.asset}</strong></div>
                <div className="flex justify-between gap-2"><span>المصدر عند التفعيل</span><strong className="text-slate-300">رصيد الإيداع</strong></div>
              </div>
              <button type="button" onClick={() => void action(activePlan ? "change" : "activate", plan._id)} disabled={Boolean(busy) || activePlan?.packageName === plan.name} className="mt-4 w-full rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50">{busy === plan._id ? "جاري التنفيذ..." : activePlan?.packageName === plan.name ? "تم التفعيل" : activePlan ? "التغيير إلى هذه الباقة" : "تفعيل الباقة"}</button>
            </article>)}</div>}
        </section>

      </main>
    </div>
  </>;
}
