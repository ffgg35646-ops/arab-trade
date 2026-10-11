"use client";

import { useCallback, useEffect, useState } from "react";
import AdminPageFrame from "@/components/AdminPageFrame";
import { CheckCircle2, Loader2, Package, Plus, RefreshCw, Save, ShieldAlert, X } from "lucide-react";

type Plan = { _id: string; name: string; description: string; price: number; asset: string; durationDays: number; enabled: boolean; sortOrder: number };
type UserPackage = { _id: string; packageName: string; investedAmount: number; asset: string; status: string; availableEarnings: number; lockedEarnings: number; totalRealizedEarnings: number; totalWithdrawn: number; firstWithdrawalStatus?: "available" | "pending" | "completed"; activatedAt: string; userId?: { _id: string; name?: string; username?: string; email?: string } | null };
type DepositBalance = { _id: string; asset: string; available: number; locked: number; userId?: { _id: string; name?: string; username?: string; email?: string } | null };
type LedgerRow = { _id: string; type: string; asset: string; amount: number; note?: string; createdAt: string; userId?: { name?: string; username?: string; email?: string } | null; userPackageId?: { packageName?: string } | null };
const emptyForm = { name: "", description: "", price: "", durationDays: "30", sortOrder: "0", enabled: true };
const money = (value: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 }).format(Number(value || 0));
const firstStatus = (account: UserPackage) => account.firstWithdrawalStatus === "pending" ? "pending" : Number(account.totalWithdrawn || 0) > 0 ? "completed" : (account.firstWithdrawalStatus || "available");

export default function AdminPackagesPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [accounts, setAccounts] = useState<UserPackage[]>([]);
  const [depositBalances, setDepositBalances] = useState<DepositBalance[]>([]);
  const [packageLedger, setPackageLedger] = useState<LedgerRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [creditId, setCreditId] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [creditNote, setCreditNote] = useState("");
  const [crediting, setCrediting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/packages", { credentials: "include", cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "تعذر تحميل الباقات");
      setPlans(Array.isArray(json.packages) ? json.packages : []);
      setAccounts(Array.isArray(json.userPackages) ? json.userPackages : []);
      setDepositBalances(Array.isArray(json.depositBalances) ? json.depositBalances : []);
      setPackageLedger(Array.isArray(json.packageLedger) ? json.packageLedger : []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل الباقات");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function editPlan(plan: Plan) {
    setEditingId(plan._id);
    setForm({ name: plan.name, description: plan.description || "", price: String(plan.price), durationDays: String(plan.durationDays), sortOrder: String(plan.sortOrder || 0), enabled: plan.enabled });
    setMessage(""); setError("");
  }
  function resetForm() { setEditingId(""); setForm(emptyForm); }

  async function savePlan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      const payload = { ...form, price: Number(form.price), durationDays: Number(form.durationDays), sortOrder: Number(form.sortOrder), ...(editingId ? { id: editingId } : {}) };
      const res = await fetch("/api/admin/packages", { method: editingId ? "PATCH" : "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "تعذر حفظ الباقة");
      setMessage(editingId ? "تم تحديث الباقة." : "تم إنشاء الباقة.");
      resetForm(); await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ الباقة");
    } finally { setSaving(false); }
  }

  async function togglePlan(plan: Plan) {
    setError(""); setMessage("");
    try {
      const res = await fetch("/api/admin/packages", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: plan._id, enabled: !plan.enabled }) });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "تعذر تعديل حالة الباقة");
      setMessage(plan.enabled ? "تم إيقاف الباقة أمام المستخدمين." : "تم تفعيل الباقة."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تعديل الباقة"); }
  }

  async function deletePlan(plan: Plan) {
    if (!window.confirm("حذف الباقة؟ إذا كان لها حسابات سابقة، سيتم إيقافها بدل حذف السجل.")) return;
    setError(""); setMessage("");
    try {
      const res = await fetch("/api/admin/packages", { method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: plan._id }) });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "تعذر حذف الباقة");
      setMessage(json.message || "تم تحديث الباقة."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر حذف الباقة"); }
  }

  async function creditEarnings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setCrediting(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/admin/packages/credit", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userPackageId: creditId.trim(), amount: Number(creditAmount), note: creditNote.trim() }) });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "تعذر تسجيل العائد");
      setMessage(json.message || "تم تسجيل العائد المحقق."); setCreditAmount(""); setCreditNote(""); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تسجيل العائد"); }
    finally { setCrediting(false); }
  }

  return <AdminPageFrame title="الباقات">
    <div dir="rtl" className="mx-auto w-full max-w-7xl space-y-6">
      <section className="rounded-3xl border border-white/10 bg-gradient-to-l from-blue-500/[0.13] via-[#08111e] to-cyan-400/[0.03] p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3"><div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/10 p-3 text-cyan-300"><Package size={25}/></div><div><h1 className="text-2xl font-black md:text-3xl">إدارة الباقات وأرصدة كل باقة</h1><p className="mt-2 text-sm leading-6 text-slate-400">إدارة خطط التفعيل ومتابعة حسابات المستخدمين وتسجيل العوائد المحققة.</p></div></div>
          <button type="button" onClick={() => { setLoading(true); setError(""); void load(); }} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-bold disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""}/>تحديث</button>
        </div>
      </section>
      {message && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] p-4 text-sm text-emerald-300"><CheckCircle2 size={17}/>{message}</div>}
      {error && <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/[0.07] p-4 text-sm text-red-300">{error}</div>}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <form onSubmit={savePlan} className="rounded-2xl border border-white/10 bg-[#08111e] p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between gap-3"><h2 className="font-black">{editingId ? "تعديل الباقة" : "إنشاء باقة"}</h2>{editingId && <button type="button" onClick={resetForm} className="rounded-lg p-2 text-slate-400" aria-label="إلغاء التعديل"><X size={16}/></button>}</div>
          <div className="space-y-4">
            <div><label className="mb-2 block text-xs font-bold text-slate-400">اسم الباقة</label><input required minLength={2} maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-[#050a13] px-4 py-3"/></div>
            <div><label className="mb-2 block text-xs font-bold text-slate-400">الوصف والشروط</label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} maxLength={1200} className="w-full rounded-xl border border-slate-700 bg-[#050a13] px-4 py-3"/></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="mb-2 block text-xs font-bold text-slate-400">قيمة التفعيل (USDT)</label><input type="number" required min="1" step="any" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-[#050a13] px-4 py-3"/></div>
              <div><label className="mb-2 block text-xs font-bold text-slate-400">المدة بالأيام</label><input type="number" required min="1" max="3650" step="1" value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-[#050a13] px-4 py-3"/></div>
              <div><label className="mb-2 block text-xs font-bold text-slate-400">ترتيب العرض</label><input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-[#050a13] px-4 py-3"/></div>
              <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#050a13] p-3 text-sm"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })}/>الباقة متاحة للمستخدمين</label>
            </div>
            <div className="flex flex-wrap gap-3"><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-black disabled:opacity-50">{saving ? <Loader2 size={17} className="animate-spin"/> : editingId ? <Save size={17}/> : <Plus size={17} />}{saving ? "جاري الحفظ..." : editingId ? "حفظ التعديلات" : "إنشاء الباقة"}</button>{editingId && <button type="button" onClick={resetForm} className="rounded-xl border border-white/10 px-5 py-3 text-sm font-bold">إلغاء</button>}</div>
          </div>
        </form>
        <section className="rounded-2xl border border-white/10 bg-[#08111e] p-5 md:p-6">
          <h2 className="mb-4 font-black">الباقات المسجلة</h2>
          {loading ? <div className="py-10 text-center text-slate-500"><Loader2 className="mx-auto animate-spin"/></div> : plans.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">لا توجد باقات. أنشئ أول باقة من النموذج.</div> : <div className="space-y-3">{plans.map((plan) => <div key={plan._id} className="rounded-xl border border-white/10 bg-[#050a13] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-black">{plan.name}</div><div className="mt-1 text-xs text-slate-500">{money(plan.price)} USDT · {plan.durationDays} يوم</div><div className="mt-2 max-w-xl text-xs leading-5 text-slate-500">{plan.description}</div></div><span className={plan.enabled ? "rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300" : "rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400"}>{plan.enabled ? "مفعلة" : "متوقفة"}</span></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => editPlan(plan)} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold">تعديل</button><button type="button" onClick={() => void togglePlan(plan)} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold">{plan.enabled ? "إيقاف" : "تفعيل"}</button><button type="button" onClick={() => void deletePlan(plan)} className="rounded-lg border border-red-400/15 px-3 py-2 text-xs font-bold text-red-300">حذف / أرشفة</button></div></div>)}</div>}
        </section>
      </div>

      <section className="rounded-2xl border border-white/10 bg-[#08111e] p-5 md:p-6">
        <h2 className="font-black">أرصدة الإيداع الخارجية للمستخدمين</h2>
        <p className="mt-1 text-xs leading-6 text-slate-500">الأرصدة الناتجة عن إيداعات خارجية اعتمدها الأدمن، وهي منفصلة عن رصيد السحب العام.</p>
        {loading ? <div className="py-6 text-center text-slate-500">جاري التحميل...</div> : depositBalances.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">لا توجد أرصدة إيداع متاحة حاليًا.</div> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[650px] text-right text-sm"><thead><tr className="border-b border-white/10 text-xs text-slate-500"><th className="px-3 py-3">المستخدم</th><th className="px-3 py-3">العملة</th><th className="px-3 py-3">متاح للتفعيل</th><th className="px-3 py-3">مقفل</th></tr></thead><tbody>{depositBalances.map((item) => <tr key={item._id} className="border-b border-white/5"><td className="px-3 py-4"><div className="font-bold">{item.userId?.name || item.userId?.username || "مستخدم"}</div><div className="mt-1 text-xs text-slate-500">{item.userId?.email || "—"}</div></td><td className="px-3 py-4 font-bold text-cyan-200">{item.asset}</td><td className="px-3 py-4 font-black">{money(item.available)}</td><td className="px-3 py-4 text-slate-400">{money(item.locked)}</td></tr>)}</tbody></table></div>}
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#08111e] p-5 md:p-6">
        <h2 className="font-black">حسابات الباقات لدى المستخدمين</h2><p className="mt-1 text-xs leading-6 text-slate-500">معرف حساب الباقة يستخدم لتسجيل عائد محقق فعليًا.</p>
        {loading ? <div className="py-8 text-center text-slate-500">جاري التحميل...</div> : accounts.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">لا توجد حسابات باقات حتى الآن.</div> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-right text-sm"><thead><tr className="border-b border-white/10 text-xs text-slate-500"><th className="px-3 py-3">المستخدم</th><th className="px-3 py-3">الباقة / الحالة</th><th className="px-3 py-3">قيمة التفعيل</th><th className="px-3 py-3">سحب الباقة المتاح</th><th className="px-3 py-3">سحب قيد المراجعة</th><th className="px-3 py-3">عائد محقق</th><th className="px-3 py-3">إجمالي السحب</th><th className="px-3 py-3">حالة أول سحب</th><th className="px-3 py-3">المعرف</th><th className="px-3 py-3">الإجراء</th></tr></thead><tbody>{accounts.map((account) => <tr key={account._id} className="border-b border-white/5"><td className="px-3 py-4"><div className="font-bold">{account.userId?.name || account.userId?.username || "مستخدم"}</div><div className="mt-1 text-xs text-slate-500">{account.userId?.email || "—"}</div></td><td className="px-3 py-4">{account.packageName}<div className="mt-1 text-xs text-slate-500">{account.status === "active" ? "نشطة" : "ملغاة"}</div></td><td className="px-3 py-4">{money(account.investedAmount)} {account.asset}</td><td className="px-3 py-4 text-emerald-300">{money(account.availableEarnings)} {account.asset}</td><td className="px-3 py-4 text-amber-200">{money(account.lockedEarnings)} {account.asset}</td><td className="px-3 py-4">{money(account.totalRealizedEarnings)} {account.asset}</td><td className="px-3 py-4">{money(account.totalWithdrawn)} {account.asset}</td><td className="px-3 py-4 text-xs">{firstStatus(account) === "available" ? `الأول حتى ${money(account.investedAmount)} ${account.asset}` : firstStatus(account) === "pending" ? "قيد المراجعة" : "تم حسمه"}</td><td className="px-3 py-4"><button type="button" onClick={() => setCreditId(account._id)} className="max-w-44 break-all text-left font-mono text-[10px] text-cyan-300 underline">{account._id}</button></td><td className="px-3 py-4"><button type="button" onClick={() => setCreditId(account._id)} disabled={account.status !== "active"} className="rounded-lg bg-blue-600/20 px-3 py-2 text-xs font-bold text-blue-200 disabled:opacity-40">تسجيل عائد</button></td></tr>)}</tbody></table></div>}
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#08111e] p-5 md:p-6">
        <h2 className="font-black">سجل حركات جميع الباقات</h2>
        <p className="mt-1 text-xs leading-6 text-slate-500">سجل تدقيقي للتفعيلات والاستردادات والعوائد المحققة وطلبات السحب.</p>
        {loading ? <div className="py-6 text-center text-slate-500">جاري التحميل...</div> : packageLedger.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">لا توجد حركات مسجلة.</div> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[850px] text-right text-sm"><thead><tr className="border-b border-white/10 text-xs text-slate-500"><th className="px-3 py-3">التاريخ</th><th className="px-3 py-3">المستخدم</th><th className="px-3 py-3">الباقة</th><th className="px-3 py-3">نوع الحركة</th><th className="px-3 py-3">المبلغ</th><th className="px-3 py-3">المرجع / الملاحظة</th></tr></thead><tbody>{packageLedger.map((row) => <tr key={row._id} className="border-b border-white/5"><td className="px-3 py-4 text-xs text-slate-500">{new Date(row.createdAt).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}</td><td className="px-3 py-4"><div className="font-bold">{row.userId?.name || row.userId?.username || "مستخدم"}</div><div className="text-xs text-slate-500">{row.userId?.email || "—"}</div></td><td className="px-3 py-4">{row.userPackageId?.packageName || "—"}</td><td className="px-3 py-4 text-xs">{row.type}</td><td className={Number(row.amount) < 0 ? "px-3 py-4 font-black text-red-300" : "px-3 py-4 font-black text-emerald-300"}>{Number(row.amount) > 0 ? "+" : ""}{money(row.amount)} {row.asset}</td><td className="max-w-72 px-3 py-4 text-xs text-slate-400">{row.note || "—"}</td></tr>)}</tbody></table></div>}
      </section>

      <section className="rounded-2xl border border-cyan-300/15 bg-[#07101d] p-5 md:p-6">
        <h2 className="font-black">تسجيل عائد محقق</h2><p className="mt-1 text-xs leading-6 text-slate-500">لا تستخدمه إلا لمبلغ محقق فعليًا ومدعوم بتسوية مالية، مع ذكر المرجع أو السبب.</p>
        <form onSubmit={creditEarnings} className="mt-4 grid gap-3 lg:grid-cols-[1.3fr_0.7fr_1.5fr_auto]">
          <input required value={creditId} onChange={(e) => setCreditId(e.target.value)} placeholder="معرف حساب الباقة" className="rounded-xl border border-slate-700 bg-[#050a13] px-4 py-3 font-mono text-xs"/>
          <input required type="number" min="0.00000001" step="any" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} placeholder="المبلغ (USDT)" className="rounded-xl border border-slate-700 bg-[#050a13] px-4 py-3"/>
          <input required minLength={5} value={creditNote} onChange={(e) => setCreditNote(e.target.value)} placeholder="مرجع التسوية / سبب العائد المحقق" className="rounded-xl border border-slate-700 bg-[#050a13] px-4 py-3"/>
          <button type="submit" disabled={crediting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-5 py-3 font-black text-slate-950 disabled:opacity-50">{crediting ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} تسجيل</button>
        </form>
      </section>

      <section className="flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-4 text-xs leading-6 text-amber-100/80"><ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-300"/><div>الإيداع الخارجي يظهر في رصيد الإيداع. تفعيل الباقة يخصم منه، وإلغاء الباقة يحوّل نصف قيمة التفعيل إلى رصيد السحب العام. العائد داخل الباقة يُسحب من خانة الباقة بعد تسجيل عائد محقق.</div></section>
    </div>
  </AdminPageFrame>;
}
