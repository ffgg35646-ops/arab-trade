"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
type PackageRow = {
  _id: string; name: string; price: number; minimum: number; enabled: boolean;
  account: null | { status: string; balance: number; locked: number; available: number; hasAccount: boolean };
};
type Network = { code: string; name: string };
type Withdrawal = {
  _id: string; type: string; packageId: string | null; amount: number; asset: string;
  network: string; payoutAddress: string; status: "pending" | "approved" | "rejected"; createdAt: string;
};
type Data = {
  success: boolean; packages: PackageRow[]; networks: Network[];
  general: { available: number; minimum: number; configured: boolean };
  requests: Withdrawal[];
};
const amount = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 8 });
const statusText: Record<string, string> = { pending: "معلّق", approved: "مقبول", rejected: "مرفوض" };

export default function WithdrawPage() {
  const [data, setData] = useState<Data | null>(null);
  const [kind, setKind] = useState<"package" | "general">("package");
  const [packageId, setPackageId] = useState("");
  const [value, setValue] = useState("");
  const [network, setNetwork] = useState("TRC20");
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/withdrawals", { cache: "no-store" });
      const result = await response.json();
      if (response.ok && result.success) {
        setData(result);
        setPackageId((current) => current || result.packages?.find((p: PackageRow) => p.account)?._id || "");
        setNetwork((current) => result.networks?.some((n: Network) => n.code === current) ? current : result.networks?.[0]?.code || "");
      } else setMessage(result.message || "تعذر تحميل بيانات السحب");
    } catch { setMessage("تعذر الاتصال بالخادم"); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selected = data?.packages.find((p) => p._id === packageId);
  const available = data?.general.available || 0;
  const minimum = kind === "general" ? (data?.general.minimum || 0) : (selected?.minimum || 0);
  const pending = data?.requests.filter((r) => r.status === "pending") || [];
  const history = data?.requests.filter((r) => r.status !== "pending") || [];

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/withdrawals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: kind, packageId: kind === "package" ? packageId : undefined,
          amount: Number(value), asset: "USDT", network, payoutAddress: address }),
      });
      const result = await response.json();
      setMessage(result.success ? "تم إنشاء طلب السحب، والمبلغ ظاهر الآن ضمن المحجوز فقط." : (result.message || "تعذر إنشاء طلب السحب"));
      if (result.success) { setValue(""); setAddress(""); await load(); }
    } catch { setMessage("تعذر الاتصال بالخادم"); }
    finally { setBusy(false); }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 text-slate-900">
      
      <div className="mx-auto flex w-full max-w-7xl gap-5 px-3 py-5 sm:px-6">
        
        <main className="min-w-0 flex-1 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div><h1 className="text-2xl font-bold">السحب</h1><p className="mt-1 text-sm text-slate-500">أرصدة السحب لكل باقة مستقلة عن باقي الباقات.</p></div>
            <Link href="/dashboard/assets" className="text-sm text-emerald-700 hover:underline">العودة للأصول</Link>
          </div>

          {message && <div role="status" className="rounded-xl border border-slate-200 bg-white p-3 text-sm">{message}</div>}

          {!data ? <div className="rounded-2xl bg-white p-6 text-slate-500">جاري تحميل بيانات السحب…</div> : <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="font-bold">إجمالي رصيد الباقة</h2>
                <p className="mt-3 text-xl font-bold" dir="ltr">{amount(data.packages.reduce((sum, p) => sum + (p.account ? p.account.balance + p.account.locked : 0), 0))} USDT</p>
              </article>
              {data.packages.filter((p) => p.account).map((p) => (
                <article key={p._id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h2 className="font-bold">{p.name}</h2>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">إجمالي رصيد الباقة</p><p className="mt-1 font-bold" dir="ltr">{amount((p.account?.balance || 0) + (p.account?.locked || 0))} USDT</p></div>
                    <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">محجوز لطلبات معلّقة</p><p className="mt-1 font-bold" dir="ltr">{amount(p.account?.locked || 0)} USDT</p></div>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">الحد الأدنى للسحب: {amount(p.minimum)} USDT</p>
                </article>
              ))}
            </section>

            <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-lg font-bold">السحب</h2>
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-500">{kind === "general" ? "الرصيد العام المتاح" : "رصيد الباقة المتاح للسحب"}</p>
                  <p className="mt-1 text-lg font-bold" dir="ltr">{amount(kind === "general" ? available : (selected?.account?.available || 0))} USDT</p>
                </div>
                <div className="border-r border-slate-200 pr-3">
                  <p className="text-xs text-slate-500">الحد الأدنى للسحب</p>
                  <p className="mt-1 font-semibold" dir="ltr">{amount(minimum)} USDT</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">مصدر السحب
                  <select className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3" value={kind} onChange={(e) => setKind(e.target.value as "package" | "general")}>
                    <option value="package">رصيد باقة</option><option value="general">الرصيد العام</option>
                  </select>
                </label>
                {kind === "package" && <label className="block text-sm font-medium">الباقة
                  <select required className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3" value={packageId} onChange={(e) => setPackageId(e.target.value)}>
                    <option value="">اختر الباقة</option>{data.packages.filter((p) => p.account).map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                  </select>
                </label>}
                <label className="block text-sm font-medium">المبلغ (USDT)
                  <input required min="0.00000001" step="0.00000001" type="number" className="mt-1 w-full rounded-xl border border-slate-300 p-3" value={value} onChange={(e) => setValue(e.target.value)} />
                  <span className="mt-1 block text-xs text-slate-500">{kind === "general" ? "المتاح في الرصيد العام: " + amount(available) + " USDT · " : ""}الحد الأدنى: {amount(minimum)} USDT</span>
                </label>
                <label className="block text-sm font-medium">الشبكة
                  <select required className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3" value={network} onChange={(e) => setNetwork(e.target.value)}>
                    {data.networks.map((n) => <option key={n.code} value={n.code}>{n.code} — {n.name}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-medium sm:col-span-2">عنوان الإيداع (محفظة USDT)
                  <input required minLength={3} maxLength={200} className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-left" dir="ltr" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="أدخل عنوان المحفظة" />
                </label>
              </div>
              <button disabled={busy || !data.networks.length || (kind === "package" && !selected?.account)} className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? "جارٍ إرسال الطلب…" : "طلب سحب"}</button>
            </form>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-lg font-bold">طلبات السحب المعلّقة</h2>
              <p className="mt-1 text-sm text-slate-500">هذه الطلبات فقط هي التي تظهر كمبالغ محجوزة بانتظار قرار الإدارة.</p>
              {pending.length ? <div className="mt-3 divide-y divide-slate-100">{pending.map((r) => <div key={r._id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{amount(r.amount)} {r.asset} · {r.network}</p><p className="break-all text-xs text-slate-500" dir="ltr">{r.payoutAddress}</p><p className="text-xs text-slate-500">{new Date(r.createdAt).toLocaleString("ar-EG")}</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-800">{statusText[r.status]}</span></div>)}</div> : <p className="mt-3 text-sm text-slate-500">لا توجد طلبات معلّقة.</p>}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-lg font-bold">سجل الطلبات السابقة</h2>
              <p className="mt-1 text-sm text-slate-500">السجل للعرض فقط؛ الطلب المقبول أو المرفوض لا يُحسب كمبلغ محجوز حاليًا.</p>
              {history.length ? <div className="mt-3 divide-y divide-slate-100">{history.map((r) => <div key={r._id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{amount(r.amount)} {r.asset} · {r.network}</p><p className="break-all text-xs text-slate-500" dir="ltr">{r.payoutAddress}</p><p className="text-xs text-slate-500">{new Date(r.createdAt).toLocaleString("ar-EG")}</p></div><span className={`rounded-full px-3 py-1 text-sm ${r.status === "approved" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{statusText[r.status] || r.status}</span></div>)}</div> : <p className="mt-3 text-sm text-slate-500">لا توجد طلبات سابقة.</p>}
            </section>
          </>}
        </main>
      </div>
    </div>
  );
}
