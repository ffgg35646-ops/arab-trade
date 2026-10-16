"use client";

import { useCallback, useEffect, useState } from "react";
import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";
import { CheckCircle2, Layers3, Wallet } from "lucide-react";

type PackageWithdrawal = {
  balance: number;
  locked: number;
  allowance: number;
  available: number;
  minimum: number;
  hasAccount: boolean;
};
type Network = { code: string; name: string };
type Request = { _id: string; type: string; amount: number; status: string };
type Data = {
  general: { available: number; minimum: number; configured: boolean };
  packageWithdrawal: PackageWithdrawal;
  networks: Network[];
  requests: Request[];
};

const money = (value: number) =>
  Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 8 });

export default function WithdrawalsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [packageAmount, setPackageAmount] = useState("");
  const [packageAddress, setPackageAddress] = useState("");
  const [packageNetwork, setPackageNetwork] = useState("");
  const [generalAmount, setGeneralAmount] = useState("");
  const [generalAddress, setGeneralAddress] = useState("");
  const [generalNetwork, setGeneralNetwork] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/withdrawals", { credentials: "include", cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setMessage(json.message || "تعذر تحميل بيانات السحب");
        return;
      }
      setData(json as Data);
      setGeneralNetwork((current) => {
        if (current && json.networks?.some((network: Network) => network.code === current)) return current;
        return json.networks?.[0]?.code || "";
      });
      setPackageNetwork((current) => {
        if (current && json.networks?.some((network: Network) => network.code === current)) return current;
        return json.networks?.[0]?.code || "";
      });
    } catch {
      setMessage("تعذر تحميل بيانات السحب");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const hasPending = Boolean(data?.requests.some((item) => item.status === "pending"));
  const firstNetwork = data?.networks[0]?.code || "";
  const selectedGeneralNetwork = generalNetwork || firstNetwork;
  const selectedPackageNetwork = packageNetwork || firstNetwork;

  async function submit(body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/withdrawals", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      setMessage(result.message || (response.ok ? "تم إرسال طلب السحب" : "تعذر إنشاء الطلب"));
      await load();
    } catch {
      setMessage("تعذر الاتصال");
    } finally {
      setBusy(false);
    }
  }

  function submitGeneral() {
    const amount = Number(generalAmount);
    if (!generalAddress.trim()) return setMessage("اكتب عنوان الدفع");
    if (!selectedGeneralNetwork) return setMessage("لا توجد شبكة مفعّلة من إعدادات الأدمن");
    if (!data?.general.configured) return setMessage("الأدمن لم يحدد الحد الأدنى للسحب العام بعد");
    if (!Number.isFinite(amount) || amount <= 0) return setMessage("اكتب مبلغ السحب");
    void submit({
      type: "general",
      amount,
      asset: "USDT",
      network: selectedGeneralNetwork,
      payoutAddress: generalAddress.trim(),
    });
  }

  function submitPackages() {
    const amount = Number(packageAmount);
    if (!data?.packageWithdrawal.hasAccount) return setMessage("لا يوجد رصيد أرباح من الباقات حتى الآن");
    if (!packageAddress.trim()) return setMessage("اكتب عنوان الدفع");
    if (!selectedPackageNetwork) return setMessage("لا توجد شبكة مفعّلة من إعدادات الأدمن");
    if (!Number.isFinite(amount) || amount < data.packageWithdrawal.minimum) {
      return setMessage("الحد الأدنى للسحب من الباقات هو " + data.packageWithdrawal.minimum + " USDT");
    }
    void submit({
      type: "package",
      amount,
      asset: "USDT",
      network: selectedPackageNetwork,
      payoutAddress: packageAddress.trim(),
    });
  }

  return (
    <>
      <InternalNavbar />
      <div className="mx-auto flex max-w-[1700px]">
        <InternalSidebar />
        <main dir="rtl" className="min-h-screen min-w-0 flex-1 space-y-6 bg-[#050a13] p-4 text-white md:p-6">
          <h1 className="text-2xl font-black">السحب</h1>

          {message && (
            <div role="status" className="flex items-start gap-2 rounded-xl border border-slate-700 bg-[#0b1422] p-3 text-sm text-slate-200">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-cyan-300" />
              <span>{message}</span>
            </div>
          )}

          <section className="space-y-4 rounded-2xl border border-slate-700 bg-[#08111e] p-4 md:p-5">
            <div className="flex items-center gap-2">
              <Wallet size={20} className="text-cyan-300" />
              <h2 className="text-xl font-black">السحب العام</h2>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="grid gap-3 rounded-xl border border-slate-700 bg-[#0b1422] p-4 sm:grid-cols-2">
                <label className="block space-y-2 text-sm text-slate-300">
                  <span>العملة</span>
                  <select value="USDT" disabled className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white disabled:opacity-100">
                    <option value="USDT">USDT</option>
                  </select>
                </label>
                <label className="block space-y-2 text-sm text-slate-300">
                  <span>الشبكة</span>
                  <select value={selectedGeneralNetwork} onChange={(event) => setGeneralNetwork(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white">
                    {!data?.networks.length && <option value="">لا توجد شبكات</option>}
                    {data?.networks.map((network) => <option key={network.code} value={network.code}>{network.name} ({network.code})</option>)}
                  </select>
                </label>
              </div>

              <div className="space-y-3 rounded-xl border border-slate-700 bg-[#0b1422] p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-300">الرصيد المتاح</span>
                  <strong className="text-xl font-black text-white">{data ? money(data.general.available) : "—"} USDT</strong>
                </div>
                <label className="block space-y-2 text-sm text-slate-300">
                  <span>مبلغ السحب</span>
                  <input type="number" min={data?.general.minimum || undefined} step="any" value={generalAmount} onChange={(event) => setGeneralAmount(event.target.value)} placeholder={data?.general.configured ? "الحد الأدنى " + money(data.general.minimum) + " USDT" : "الحد الأدنى يحدده الأدمن"} className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white placeholder:text-slate-500" />
                </label>
              </div>
            </div>

            <label className="block space-y-2 text-sm text-slate-300">
              <span>عنوان الدفع</span>
              <input value={generalAddress} onChange={(event) => setGeneralAddress(event.target.value)} placeholder="عنوان محفظة الاستلام" className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white placeholder:text-slate-500" />
            </label>

            {!data?.general.configured && (
              <p className="text-xs text-amber-300">السحب العام غير مفعّل حتى يحدد الأدمن الحد الأدنى من إعدادات السحوبات.</p>
            )}
            <button type="button" onClick={submitGeneral} disabled={busy || hasPending || !data?.general.configured || !selectedGeneralNetwork} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-black text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40">
              طلب سحب
            </button>
          </section>

          <section className="space-y-4 rounded-2xl border border-slate-700 bg-[#08111e] p-4 md:p-5">
            <div className="flex items-center gap-2">
              <Layers3 size={20} className="text-cyan-300" />
              <h2 className="text-xl font-black">السحب من أرباح الباقات</h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-700 bg-[#0b1422] p-4">
                <p className="text-sm text-slate-400">إجمالي أرباح الباقات المتاحة بالحساب</p>
                <p className="mt-2 text-xl font-black text-white">{data ? money(data.packageWithdrawal.balance) : "—"} USDT</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-[#0b1422] p-4">
                <p className="text-sm text-slate-400">المتاح للسحب وفق حدود الباقات</p>
                <p className="mt-2 text-xl font-black text-emerald-300">{data ? money(data.packageWithdrawal.available) : "—"} USDT</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-[#0b1422] p-4">
                <p className="text-sm text-slate-400">الرصيد المحجوز لطلبات السحب</p>
                <p className="mt-2 text-xl font-black text-amber-200">{data ? money(data.packageWithdrawal.locked) : "—"} USDT</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2 text-sm text-slate-300">
                <span>العملة</span>
                <select value="USDT" disabled className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white disabled:opacity-100">
                  <option value="USDT">USDT</option>
                </select>
              </label>
              <label className="block space-y-2 text-sm text-slate-300">
                <span>الشبكة</span>
                <select value={selectedPackageNetwork} onChange={(event) => setPackageNetwork(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white">
                  {!data?.networks.length && <option value="">لا توجد شبكات</option>}
                  {data?.networks.map((network) => <option key={network.code} value={network.code}>{network.name} ({network.code})</option>)}
                </select>
              </label>
            </div>

            <label className="block space-y-2 text-sm text-slate-300">
              <span>عنوان الدفع</span>
              <input value={packageAddress} onChange={(event) => setPackageAddress(event.target.value)} placeholder="عنوان محفظة الاستلام" className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white placeholder:text-slate-500" />
            </label>

            <label className="block space-y-2 text-sm text-slate-300">
              <span>مبلغ السحب من الباقات</span>
              <input type="number" min={data?.packageWithdrawal.minimum || undefined} step="any" value={packageAmount} onChange={(event) => setPackageAmount(event.target.value)} placeholder={"الحد الأدنى " + money(data?.packageWithdrawal.minimum || 100) + " USDT"} className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white placeholder:text-slate-500" />
            </label>

            <button
              type="button"
              onClick={submitPackages}
              disabled={busy || hasPending || !data?.packageWithdrawal.hasAccount || data.packageWithdrawal.available <= 0 || !selectedPackageNetwork}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 font-black text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              طلب سحب من أرباح الباقات
            </button>
          </section>
        </main>
      </div>
    </>
  );
}
