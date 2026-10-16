"use client";

import { useCallback, useEffect, useState } from "react";
import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";

type Account = {
  _id: string;
  status: string;
  balance: number;
  locked: number;
  allowance: number;
  available: number;
};
type Plan = { _id: string; name: string; minimum: number; accounts: Account[] };
type Request = { _id: string; userPackageId: string; amount: number; status: string; asset?: string; network?: string; payoutAddress?: string };
type SpotBalance = { asset: string; available: number };

const networks = [
  { value: "TRC20", label: "TRC20" },
  { value: "BEP20", label: "BEP20 (BNB)" },
];

export default function WithdrawalsPage() {
  const [data, setData] = useState<{ packages: Plan[]; requests: Request[] } | null>(null);
  const [spotBalances, setSpotBalances] = useState<SpotBalance[]>([]);
  const [walletLoaded, setWalletLoaded] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [addresses, setAddresses] = useState<Record<string, string>>({});
  const [packageNetworks, setPackageNetworks] = useState<Record<string, string>>({});
  const [generalAmount, setGeneralAmount] = useState("");
  const [generalNetwork, setGeneralNetwork] = useState("TRC20");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const [withdrawalResponse, walletResponse] = await Promise.all([
        fetch("/api/withdrawals", { cache: "no-store" }),
        fetch("/api/wallet", { cache: "no-store" }),
      ]);
      const withdrawalData = await withdrawalResponse.json();
      const walletData = await walletResponse.json();
      if (withdrawalData.success) setData(withdrawalData);
      else setMessage(withdrawalData.message || "تعذر تحميل بيانات السحب");
      if (walletData.success) {
        setSpotBalances(Array.isArray(walletData.spot?.balances) ? walletData.spot.balances : []);
        setWalletLoaded(true);
      }
    } catch {
      setMessage("تعذر تحميل بيانات السحب");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const generalAvailable = spotBalances
    .filter((item) => String(item.asset || "").toUpperCase() === "USDT")
    .reduce((sum, item) => sum + Number(item.available || 0), 0);
  const hasPending = Boolean(data?.requests.some((item) => item.status === "pending"));

  async function submitPackage(accountId: string, minimum: number) {
    const address = (addresses[accountId] || "").trim();
    const amount = Number(amounts[accountId]);
    if (!address) {
      setMessage("اكتب عنوان الدفع لهذه الباقة");
      return;
    }
    if (!Number.isFinite(amount) || amount < minimum) {
      setMessage("الحد الأدنى للسحب هو " + minimum + " USDT");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userPackageId: accountId,
          amount,
          asset: "USDT",
          network: packageNetworks[accountId] || "TRC20",
          payoutAddress: address,
        }),
      });
      const result = await response.json();
      setMessage(result.message || "تعذر إنشاء طلب السحب");
      await load();
    } catch {
      setMessage("تعذر الاتصال");
    } finally {
      setBusy(false);
    }
  }

  function submitGeneral() {
    if (!Number.isFinite(Number(generalAmount)) || Number(generalAmount) <= 0) {
      setMessage("اكتب مبلغ السحب");
      return;
    }
    setMessage("طلب السحب العام لم يُفعّل بعد؛ قواعد الخصم والحد الأدنى لهذا الرصيد لم تُحدد بعد.");
  }

  return (
    <>
      <InternalNavbar />
      <div className="mx-auto flex max-w-[1700px]">
        <InternalSidebar />
        <main dir="rtl" className="min-h-screen min-w-0 flex-1 space-y-6 bg-[#050a13] p-4 text-white md:p-6">
          <h1 className="text-2xl font-bold">السحب</h1>

          {message && (
            <p role="status" className="rounded-xl border border-slate-700 bg-[#0b1422] p-3 text-sm text-slate-200">
              {message}
            </p>
          )}

          <section className="space-y-4 rounded-2xl border border-slate-700 bg-[#08111e] p-4 md:p-5">
            <h2 className="text-xl font-bold">السحب العام</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3 rounded-xl border border-slate-700 bg-[#0b1422] p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-2 text-sm text-slate-300">
                    <span>العملة</span>
                    <select defaultValue="USDT" className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white">
                      <option value="USDT">USDT</option>
                    </select>
                  </label>
                  <label className="block space-y-2 text-sm text-slate-300">
                    <span>الشبكة</span>
                    <select value={generalNetwork} onChange={(event) => setGeneralNetwork(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white">
                      {networks.map((network) => <option key={network.value} value={network.value}>{network.label}</option>)}
                    </select>
                  </label>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-slate-700 bg-[#0b1422] p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-300">الرصيد المتاح</span>
                  <strong className="text-lg font-bold text-white">
                    {walletLoaded ? generalAvailable.toLocaleString("en-US", { maximumFractionDigits: 8 }) + " USDT" : "— USDT"}
                  </strong>
                </div>
                <label className="block space-y-2 text-sm text-slate-300">
                  <span>مبلغ السحب</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={generalAmount}
                    onChange={(event) => setGeneralAmount(event.target.value)}
                    placeholder="اكتب المبلغ"
                    className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white placeholder:text-slate-500"
                  />
                </label>
              </div>
            </div>
            <button type="button" onClick={submitGeneral} disabled={busy} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white transition hover:bg-blue-500 disabled:opacity-50">
              طلب سحب
            </button>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold">السحب من الباقات</h2>
            {!data && <p className="text-sm text-slate-400">جاري تحميل الباقات…</p>}
            {data && data.packages.every((plan) => plan.accounts.length === 0) && (
              <p className="rounded-xl border border-slate-700 p-4 text-slate-400">لا توجد حسابات سحب مرتبطة بباقاتك.</p>
            )}
            <div className="grid gap-4 xl:grid-cols-2">
              {data?.packages.filter((plan) => plan.accounts.length > 0).flatMap((plan) =>
                plan.accounts.map((account) => (
                  <article key={account._id} className="space-y-4 rounded-2xl border border-slate-700 bg-[#08111e] p-4 md:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                        <p className="text-xs text-slate-400">{account.status === "active" ? "باقة نشطة" : "باقة سابقة"}</p>
                      </div>
                      <div className="shrink-0 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2 text-left">
                        <p className="text-xs text-slate-400">الرصيد المتاح</p>
                        <p className="mt-1 font-bold text-emerald-300">{account.available.toLocaleString("en-US", { maximumFractionDigits: 8 })} USDT</p>
                      </div>
                    </div>

                    <label className="block space-y-2 text-sm text-slate-300">
                      <span>عنوان الدفع</span>
                      <input
                        type="text"
                        autoComplete="off"
                        value={addresses[account._id] || ""}
                        onChange={(event) => setAddresses((current) => ({ ...current, [account._id]: event.target.value }))}
                        placeholder="أدخل عنوان محفظة الاستلام"
                        className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white placeholder:text-slate-500"
                      />
                    </label>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-2 text-sm text-slate-300">
                        <span>العملة</span>
                        <select defaultValue="USDT" className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white">
                          <option value="USDT">USDT</option>
                        </select>
                      </label>
                      <label className="block space-y-2 text-sm text-slate-300">
                        <span>الشبكة</span>
                        <select
                          value={packageNetworks[account._id] || "TRC20"}
                          onChange={(event) => setPackageNetworks((current) => ({ ...current, [account._id]: event.target.value }))}
                          className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white"
                        >
                          {networks.map((network) => <option key={network.value} value={network.value}>{network.label}</option>)}
                        </select>
                      </label>
                    </div>

                    <input
                      aria-label={"مبلغ السحب من " + plan.name}
                      type="number"
                      min={plan.minimum}
                      step="any"
                      value={amounts[account._id] || ""}
                      onChange={(event) => setAmounts((current) => ({ ...current, [account._id]: event.target.value }))}
                      placeholder={"الحد الأدنى " + plan.minimum + " USDT"}
                      className="w-full rounded-lg border border-slate-700 bg-[#050a13] p-3 text-white placeholder:text-slate-400"
                    />

                    <button
                      type="button"
                      disabled={busy || hasPending || !addresses[account._id]?.trim()}
                      onClick={() => void submitPackage(account._id, plan.minimum)}
                      className="w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      دفع
                    </button>
                    {hasPending && <p className="text-xs text-amber-300">لديك طلب سحب قائم بالفعل.</p>}
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold">طلبات السحب</h2>
            {data?.requests.map((item) => (
              <div key={item._id} className="rounded-xl border border-slate-700 bg-[#08111e] p-3">
                <p className="font-semibold">{item.amount} {item.asset || "USDT"} — {item.status === "pending" ? "معلق" : item.status === "approved" ? "مقبول" : "مرفوض"}</p>
                {item.network && <p className="mt-1 text-sm text-slate-400">الشبكة: {item.network}</p>}
                {item.payoutAddress && <p className="mt-1 break-all text-sm text-slate-400">عنوان الدفع: {item.payoutAddress}</p>}
              </div>
            ))}
          </section>
        </main>
      </div>
    </>
  );
}
