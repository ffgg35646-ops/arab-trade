"use client";

import { useCallback, useEffect, useState } from "react";
import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";
import { CheckCircle2, CircleDollarSign, Layers3, Wallet } from "lucide-react";

type Account = {
  _id: string;
  sourceAccountIds: string[];
  status: string;
  balance: number;
  locked: number;
  allowance: number;
  available: number;
  hasAccount: boolean;
};
type Plan = {
  _id: string;
  name: string;
  price: number;
  minimum: number;
  enabled: boolean;
  account: Account | null;
};
type Network = { code: string; name: string };
type Request = {
  _id: string;
  type: string;
  packageId?: string | null;
  amount: number;
  asset?: string;
  network?: string;
  payoutAddress?: string;
  status: string;
};
type Data = {
  general: { available: number; minimum: number; configured: boolean };
  networks: Network[];
  packages: Plan[];
  requests: Request[];
};

const money = (value: number) =>
  Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 8 });

export default function WithdrawalsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [addresses, setAddresses] = useState<Record<string, string>>({});
  const [packageNetworks, setPackageNetworks] = useState<Record<string, string>>({});
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
    } catch {
      setMessage("تعذر تحميل بيانات السحب");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const hasPending = Boolean(data?.requests.some((item) => item.status === "pending"));
  const firstNetwork = data?.networks[0]?.code || "";
  const selectedGeneralNetwork = generalNetwork || firstNetwork;

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
    if (!generalAddress.trim()) {
      setMessage("اكتب عنوان الدفع");
      return;
    }
    if (!selectedGeneralNetwork) {
      setMessage("لا توجد شبكة مفعّلة من إعدادات الأدمن");
      return;
    }
    if (!data?.general.configured) {
      setMessage("الأدمن لم يحدد الحد الأدنى للسحب العام بعد");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("اكتب مبلغ السحب");
      return;
    }
    void submit({
      type: "general",
      amount,
      asset: "USDT",
      network: selectedGeneralNetwork,
      payoutAddress: generalAddress.trim(),
    });
  }

  function submitPackage(plan: Plan) {
    const account = plan.account;
    const address = (addresses[plan._id] || "").trim();
    const amount = Number(amounts[plan._id]);
    const network = packageNetworks[plan._id] || firstNetwork;

    if (!account?.hasAccount) {
      setMessage("لا يوجد حساب سحب لهذه الباقة قبل تفعيلها");
      return;
    }
    if (!address) {
      setMessage("اكتب عنوان الدفع لهذه الباقة");
      return;
    }
    if (!network) {
      setMessage("لا توجد شبكة مفعّلة من إعدادات الأدمن");
      return;
    }
    if (!Number.isFinite(amount) || amount < plan.minimum) {
      setMessage("الحد الأدنى للسحب هو " + plan.minimum + " USDT");
      return;
    }
    void submit({
      type: "package",
      packageId: plan._id,
      amount,
      asset: "USDT",
      network,
      payoutAddress: address,
    });
  }

  const visiblePackages = data?.packages || [];

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

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Layers3 size={20} className="text-cyan-300" />
              <h2 className="text-xl font-black">السحب من الباقات</h2>
            </div>

            {!data && <p className="text-sm text-slate-400">جاري تحميل الباقات…</p>}
            {data && visiblePackages.length === 0 && <p className="rounded-xl border border-slate-700 p-4 text-slate-400">لا توجد باقات متاحة أو أرصدة سحب قديمة.</p>}

            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {visiblePackages.map((plan) => {
                const account = plan.account;
                const network = packageNetworks[plan._id] || firstNetwork;
                const canWithdraw = Boolean(account?.hasAccount && account.available > 0);
                return (
                  <article key={plan._id} className="flex flex-col gap-4 rounded-2xl border border-slate-700 bg-[#08111e] p-4 md:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-black">{plan.name}</h3>
                      </div>
                      <div className="shrink-0 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2 text-left">
                        <p className="text-xs text-slate-400">الرصيد المتاح</p>
                        <p className="mt-1 font-black text-emerald-300">{money(account?.available || 0)} USDT</p>
                      </div>
                    </div>

                    <label className="block space-y-2 text-sm text-slate-300">
                      <span>عنوان الدفع</span>
                      <input type="text" autoComplete="off" value={addresses[plan._id] || ""} onChange={(event) => setAddresses((current) => ({ ...current, [plan._id]: event.target.value }))} placeholder="أدخل عنوان محفظة الاستلام" className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white placeholder:text-slate-500" />
                    </label>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-2 text-sm text-slate-300">
                        <span>العملة</span>
                        <select value="USDT" disabled className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white disabled:opacity-100">
                          <option value="USDT">USDT</option>
                        </select>
                      </label>
                      <label className="block space-y-2 text-sm text-slate-300">
                        <span>الشبكة</span>
                        <select value={network} onChange={(event) => setPackageNetworks((current) => ({ ...current, [plan._id]: event.target.value }))} className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white">
                          {!data?.networks.length && <option value="">لا توجد شبكات</option>}
                          {data?.networks.map((item) => <option key={item.code} value={item.code}>{item.name} ({item.code})</option>)}
                        </select>
                      </label>
                    </div>

                    <input aria-label={"مبلغ السحب من " + plan.name} type="number" min={plan.minimum} step="any" value={amounts[plan._id] || ""} onChange={(event) => setAmounts((current) => ({ ...current, [plan._id]: event.target.value }))} placeholder={"الحد الأدنى " + money(plan.minimum) + " USDT"} className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white placeholder:text-slate-400" />

                    <div className="mt-auto space-y-2">
                      <button type="button" disabled={busy || hasPending || !canWithdraw || !addresses[plan._id]?.trim() || !network} onClick={() => submitPackage(plan)} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-black text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40">
                        دفع
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

        </main>
      </div>
    </>
  );
}
