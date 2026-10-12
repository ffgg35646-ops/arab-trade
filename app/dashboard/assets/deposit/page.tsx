"use client";

import { useEffect, useMemo, useState } from "react";
import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";

type DepositBalance = { asset: string; available: number; locked: number };
type DepositRecord = { _id?: string; id?: string; asset: string; network: string; amount: number; status: string; txHash?: string; adminNote?: string; createdAt?: string };

type Method = {
  _id: string;
  name: string;
  asset: string;
  network: string;
  address: string;
  minDeposit: number;
  minWithdrawal: number;
  enabled: boolean;
  depositEnabled?: boolean;
  withdrawalEnabled?: boolean;
  source?: string;
};

export default function DepositPage() {
  const [methods, setMethods] = useState<Method[]>([]);
  const [depositBalances, setDepositBalances] = useState<DepositBalance[]>([]);
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");

  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [verifyingId, setVerifyingId] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void loadMethods();
  }, []);

  async function loadMethods() {
    setLoading(true);
    setError("");

    try {
      const [res, balanceRes] = await Promise.all([
        fetch("/api/payment-options", { cache: "no-store" }),
        fetch("/api/deposits", { credentials: "include", cache: "no-store" }),
      ]);

      const json = await res.json();
      const balanceJson = await balanceRes.json().catch(() => ({}));
      setDepositBalances(
        Array.isArray(balanceJson.depositBalances) ? balanceJson.depositBalances : []
      );
      setDeposits(Array.isArray(balanceJson.deposits) ? balanceJson.deposits : []);

      if (!res.ok || !json.success) {
        throw new Error(
          json.message || "تعذر تحميل وسائل الدفع"
        );
      }

      const rows = Array.isArray(json.methods)
        ? json.methods.filter(
            (method: Method) =>
              method.enabled !== false &&
              method.depositEnabled !== false
          )
        : [];

      setMethods(rows);

      if (rows.length > 0) {
        setSelectedId(rows[0]._id);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "تعذر تحميل وسائل الدفع"
      );
    } finally {
      setLoading(false);
    }
  }

  const selected = useMemo(
    () =>
      methods.find(
        (method) => method._id === selectedId
      ) || null,
    [methods, selectedId]
  );

  async function verifyBlockchainDeposit(item: DepositRecord) {
    const id = String(item._id || item.id || "");
    if (!id || !item.txHash) return;
    setVerifyingId(id);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/blockchain/verify-deposit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        if (json.confirmed === false) {
          setMessage(`لم يتم تأكيد الإيداع بعد: ${Number(json.confirmations || 0)} من ${Number(json.requiredConfirmations || 1)} تأكيدات. يمكنك المحاولة مجددًا لاحقًا.`);
        } else {
          throw new Error(json.message || "تعذر التحقق من الإيداع");
        }
      } else {
        setMessage(json.alreadyProcessed
          ? "تم التحقق من أن هذا الإيداع عولج بالفعل."
          : `تم التحقق من المعاملة وإضافة ${Number(json.amount || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })} ${json.asset} إلى رصيد الإيداع.`);
      }

      const latest = await fetch("/api/deposits", { credentials: "include", cache: "no-store" });
      const latestData = await latest.json().catch(() => ({}));
      if (latest.ok && latestData.success) {
        setDeposits(Array.isArray(latestData.deposits) ? latestData.deposits : []);
        setDepositBalances(Array.isArray(latestData.depositBalances) ? latestData.depositBalances : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر التحقق من الإيداع");
    } finally {
      setVerifyingId("");
    }
  }

  async function submit(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setSending(true);
    setError("");
    setMessage("");

    try {
      if (!selected) {
        throw new Error("اختر وسيلة دفع");
      }

      if (!selected.enabled) {
        throw new Error("وسيلة الدفع متوقفة");
      }

      if (!screenshot) {
        throw new Error("ارفع Screenshot للتحويل");
      }

      const numericAmount = Number(amount);

      if (
        !Number.isFinite(numericAmount) ||
        numericAmount <= 0
      ) {
        throw new Error("أدخل مبلغًا صحيحًا");
      }

      if (numericAmount < selected.minDeposit) {
        throw new Error(
          `الحد الأدنى للإيداع هو ${selected.minDeposit} ${selected.asset}`
        );
      }

      const form = new FormData();

      form.append("asset", selected.asset);
      form.append("network", selected.network);
      form.append("amount", amount);
      form.append("txHash", txHash);
      form.append("screenshot", screenshot);

      const res = await fetch("/api/deposits", {
        method: "POST",
        credentials: "include",
        body: form,
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          json.message || "تعذر إنشاء طلب الإيداع"
        );
      }

      setMessage(
        "تم إرسال طلب الإيداع للمراجعة."
      );

      setAmount("");
      setTxHash("");
      setScreenshot(null);
      const latest = await fetch("/api/deposits", { credentials: "include", cache: "no-store" });
      const latestData = await latest.json().catch(() => ({}));
      if (latest.ok && latestData.success) {
        setDeposits(Array.isArray(latestData.deposits) ? latestData.deposits : []);
        setDepositBalances(Array.isArray(latestData.depositBalances) ? latestData.depositBalances : []);
      }

      const input = document.getElementById(
        "deposit-screenshot"
      ) as HTMLInputElement | null;

      if (input) {
        input.value = "";
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "حدث خطأ أثناء إرسال طلب الإيداع"
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <InternalNavbar />
      <div className="mx-auto flex max-w-[1700px]">
        <InternalSidebar />
        <main
          dir="rtl"
      className="min-h-screen bg-[#050a13] p-4 text-white sm:p-6"
    >
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-black">
          إيداع
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          اختر وسيلة الدفع المفعلة من إدارة المنصة. الإيداعات الخارجية المعتمدة تضاف إلى رصيد الإيداع المنفصل.
        </p>

        <section className="mt-5 rounded-2xl border border-cyan-300/15 bg-[#08111e] p-5">
          <h2 className="text-sm font-bold text-slate-300">رصيد الإيداع المتاح</h2>
          {depositBalances.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">لا يوجد رصيد إيداع معتمد حتى الآن.</p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {depositBalances.map((item) => (
                <div key={item.asset} className="rounded-xl border border-white/10 bg-[#050a13] p-4">
                  <div className="text-xs text-slate-500">{item.asset}</div>
                  <div className="mt-2 text-xl font-black text-cyan-300">
                    {Number(item.available || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-600">
                    محجوز: {Number(item.locked || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {error && (
          <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            {message}
          </div>
        )}

        {loading && (
          <div className="mt-5 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-3 text-sm text-cyan-100">
            جاري تحميل وسائل الإيداع من إعدادات الإدارة؛ خانات الإيداع ظاهرة ويمكنك إكمالها بمجرد ظهور الوسيلة.
          </div>
        )}

        <section className="mt-5 rounded-2xl border border-blue-400/20 bg-[#08111e] p-5 md:p-6">
          <div className="mb-5">
            <h2 className="text-xl font-black">إنشاء طلب إيداع</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              أدخل مبلغ التحويل، واختر العملة والشبكة، واستخدم عنوان الإيداع الذي ضبطه الأدمن، ثم أرفق رقم المعاملة وصورة الإثبات.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div>
              <label htmlFor="deposit-method" className="mb-2 block text-sm font-bold">وسيلة الإيداع / العملة والشبكة</label>
              <select
                id="deposit-method"
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-[#0b1422] p-4 outline-none focus:border-blue-400/50"
              >
                <option value="">اختر وسيلة الإيداع</option>
                {methods.map((method) => (
                  <option key={method._id} value={method._id}>
                    {method.name} — {method.asset} / {method.network}
                  </option>
                ))}
              </select>
              {methods.length === 0 && !loading && (
                <p className="mt-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.05] p-3 text-xs leading-5 text-amber-200">
                  لا توجد وسيلة إيداع مفعلة حاليًا. خانات الإيداع موجودة، لكن إرسال الطلب يتطلب أن يضيف الأدمن وسيلة دفع ويفعّلها ويحدد عنوان التحويل.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4">
              <div className="text-xs font-bold text-cyan-200">عنوان الإيداع الذي حدده الأدمن</div>
              <div className="mt-2 break-all rounded-lg border border-white/5 bg-black/20 p-3 text-sm leading-6 text-white">
                {selected?.address || "سيظهر عنوان التحويل هنا بعد اختيار وسيلة إيداع مفعلة من الإدارة."}
              </div>
              {selected && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-white/5 bg-black/20 p-3">
                    <div className="text-xs text-slate-500">العملة والشبكة</div>
                    <div className="mt-1 font-bold">{selected.asset} · {selected.network}</div>
                  </div>
                  <div className="rounded-lg border border-white/5 bg-black/20 p-3">
                    <div className="text-xs text-slate-500">الحد الأدنى للإيداع حسب الوسيلة</div>
                    <div className="mt-1 font-black">{Number(selected.minDeposit || 0)} {selected.asset}</div>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="deposit-amount" className="mb-2 block text-sm font-bold">مبلغ الإيداع</label>
              <input
                id="deposit-amount"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                type="number"
                min="0"
                step="any"
                required
                placeholder="اكتب مبلغ التحويل الذي أرسلته"
                className="w-full rounded-xl border border-slate-700 bg-[#0b1422] p-4 text-lg font-bold outline-none focus:border-blue-400/50"
              />
              <p className="mt-2 text-xs leading-5 text-slate-500">سيتم تطبيق الحد الأدنى والأقصى اللذين ضبطهما الأدمن عند إرسال الطلب.</p>
            </div>

            <div>
              <label htmlFor="deposit-txhash" className="mb-2 block text-sm font-bold">رقم المعاملة (TX Hash)</label>
              <input
                id="deposit-txhash"
                value={txHash}
                onChange={(event) => setTxHash(event.target.value)}
                placeholder="الصق رقم المعاملة من المحفظة (إن توفر)"
                className="w-full rounded-xl border border-slate-700 bg-[#0b1422] p-4 font-mono text-sm outline-none focus:border-blue-400/50"
              />
            </div>

            <div className="rounded-xl border border-slate-800 p-4">
              <label htmlFor="deposit-screenshot" className="mb-2 block font-bold">صورة إثبات التحويل</label>
              <input
                id="deposit-screenshot"
                type="file"
                required
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => setScreenshot(event.target.files?.[0] || null)}
                className="block w-full text-sm"
              />
              <p className="mt-2 text-xs text-slate-500">JPG / PNG / WEBP — الحد الأقصى 4MB</p>
            </div>

            <button
              type="submit"
              disabled={sending || loading || !selected}
              className="w-full rounded-xl bg-blue-600 px-5 py-4 font-black transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sending ? "جاري إرسال طلب الإيداع..." : "إرسال طلب الإيداع للمراجعة"}
            </button>
          </form>
        </section>
        <section className="mt-6 rounded-2xl border border-cyan-400/20 bg-[#08111e] p-5 md:p-6">
          <h2 className="text-lg font-black">تعليمات الإيداع بالتفصيل</h2>
          <div className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
            <p><span className="ml-2 font-black text-cyan-200">1.</span>اختر وسيلة الدفع والعملة والشبكة المفعّلة من الإدارة.</p>
            <p><span className="ml-2 font-black text-cyan-200">2.</span>حوّل إلى عنوان الإيداع الظاهر للوسيلة والشبكة المختارتين فقط، وتأكد من الشبكة قبل الإرسال.</p>
            <p><span className="ml-2 font-black text-cyan-200">3.</span>اكتب المبلغ الفعلي الذي أرسلته، وأضف TX Hash إن كان متاحًا. لا تستخدم رقم معاملة لإيداع آخر.</p>
            <p><span className="ml-2 font-black text-cyan-200">4.</span>ارفع صورة واضحة لإثبات التحويل بصيغة JPG أو PNG أو WEBP، بحد أقصى 4MB.</p>
            <p><span className="ml-2 font-black text-cyan-200">5.</span>سيظهر الطلب في سجل الإيداعات بحالة «قيد المراجعة». لا يُضاف الرصيد إلا بعد اعتماد الإدارة أو إكمال التحقق الآلي المدعوم للمعاملة.</p>
          </div>
          <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-4 text-sm leading-6 text-amber-100">
            رصيد الإيداع منفصل عن رصيد السحب العام، ويُستخدم حسب قواعد المنصة للتفعيل. لا ترسل أموالًا إلى عنوان غير ظاهر في وسيلة الدفع المعتمدة.
          </div>
        </section>

        <section className="mt-7 rounded-2xl border border-slate-800 bg-[#08111e] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-black">سجل طلبات الإيداع</h2>
            <button type="button" onClick={() => void loadMethods()} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold">تحديث السجل</button>
          </div>
          {deposits.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-slate-500">لم ترسل طلبات إيداع بعد.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {deposits.map((item, index) => (
                <div key={String(item._id || item.id || index)} className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-white/10 bg-[#050a13] p-4">
                  <div>
                    <div className="font-bold">{Number(item.amount || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })} {item.asset}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.network} · {item.createdAt && !Number.isNaN(new Date(item.createdAt).getTime()) ? new Date(item.createdAt).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" }) : "—"}</div>
                    {item.txHash && <div className="mt-2 max-w-xl break-all font-mono text-[10px] text-slate-600">TX: {item.txHash}</div>}
                    {item.adminNote && <div className="mt-2 text-xs text-slate-400">ملاحظة الإدارة: {item.adminNote}</div>}
                  </div>
                  <div className="flex flex-col items-start gap-2">
                    <span className={item.status === "approved" ? "rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300" : item.status === "rejected" ? "rounded-full bg-red-400/10 px-3 py-1 text-xs font-bold text-red-300" : "rounded-full bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-200"}>
                      {item.status === "approved" ? "معتمد — أضيف لرصيد الإيداع" : item.status === "rejected" ? "مرفوض" : "قيد المراجعة"}
                    </span>
                    {item.status === "pending" && item.txHash && methods.some((method) => method.source === "asset-network" && method.asset === item.asset && method.network.toUpperCase() === item.network.toUpperCase()) && (
                      <button type="button" disabled={Boolean(verifyingId)} onClick={() => void verifyBlockchainDeposit(item)} className="rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] px-3 py-2 text-xs font-bold text-cyan-200 disabled:opacity-50">
                        {verifyingId === String(item._id || item.id) ? "جاري التحقق..." : "التحقق من البلوكشين"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
        </main>
      </div>
    </>
  );
}