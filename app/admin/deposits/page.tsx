"use client";

import AdminPageFrame from "@/components/AdminPageFrame";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, FileImage, RefreshCw, Search, X, XCircle } from "lucide-react";

type UserRef = {
  _id?: string;
  name?: string;
  username?: string;
  email?: string;
} | string | null;

type Deposit = {
  _id: string;
  userId?: UserRef;
  asset: string;
  network: string;
  amount: number;
  txHash?: string;
  address?: string;
  status: "pending" | "approved" | "rejected";
  adminNote?: string;
  screenshotPath?: string;
  screenshotStorage?: "mongodb" | "filesystem";
  hasScreenshot?: boolean;
  creditedAt?: string | null;
  confirmations?: number;
  createdAt?: string;
};

const money = (amount: unknown, asset = "") =>
  Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 }) + (asset ? " " + asset : "");

function date(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("ar-EG", { timeZone: "Africa/Cairo" });
}

function userValue(user: UserRef | undefined, key: "name" | "username" | "email") {
  if (user && typeof user === "object") return user[key] || "";
  return "";
}

function statusStyle(status: string) {
  if (status === "approved") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  if (status === "rejected") return "border-red-400/20 bg-red-400/10 text-red-200";
  return "border-amber-400/20 bg-amber-400/10 text-amber-200";
}
function statusLabel(status: string) {
  if (status === "approved") return "معتمد — أضيف الرصيد";
  if (status === "rejected") return "مرفوض";
  return "قيد المراجعة";
}

export default function AdminDepositsPage() {
  const [rows, setRows] = useState<Deposit[]>([]);
  const [selected, setSelected] = useState<Deposit | null>(null);
  const [proofExpanded, setProofExpanded] = useState(false);
  const [proofLoadError, setProofLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setRefreshing(true);
    setError("");
    try {
      const response = await fetch("/api/admin/deposits?limit=500", { credentials: "include", cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.message || json.error || "تعذر تحميل طلبات الإيداع");
      setRows(Array.isArray(json.deposits) ? json.deposits : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل طلبات الإيداع");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => { void load(); });
  }, [load]);

  const stats = useMemo(() => ({
    total: rows.length,
    pending: rows.filter((row) => row.status === "pending").length,
    approved: rows.filter((row) => row.status === "approved").length,
    rejected: rows.filter((row) => row.status === "rejected").length,
    pendingAmount: rows.filter((row) => row.status === "pending").reduce((sum, row) => sum + Number(row.amount || 0), 0),
  }), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...rows]
      .filter((row) => statusFilter === "all" || row.status === statusFilter)
      .filter((row) => {
        if (!q) return true;
        const user = [userValue(row.userId, "name"), userValue(row.userId, "username"), userValue(row.userId, "email")].join(" ");
        return [user, row._id, row.asset, row.network, row.txHash, row.address, row.adminNote].some((value) => String(value || "").toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const aa = new Date(a.createdAt || 0).getTime();
        const bb = new Date(b.createdAt || 0).getTime();
        return sort === "newest" ? bb - aa : aa - bb;
      });
  }, [rows, search, statusFilter, sort]);

  function openReview(row: Deposit) {
    setSelected(row);
    setProofExpanded(false);
    setProofLoadError(false);
    setNote(row.adminNote || "");
    setError("");
    setMessage("");
  }

  async function review(nextStatus: "approved" | "rejected") {
    if (!selected || busy) return;
    if (nextStatus === "rejected" && !note.trim()) {
      setError("اكتب سبب الرفض حتى يظهر للمستخدم في سجل الإيداع.");
      return;
    }
    const question = nextStatus === "approved"
      ? "تأكيد اعتماد الإيداع وإضافة المبلغ إلى رصيد الإيداع؟"
      : "تأكيد رفض الإيداع؟ لن تتم إضافة أي رصيد.";
    if (!window.confirm(question)) return;

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/deposits", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected._id, status: nextStatus, adminNote: note.trim() }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.message || "تعذرت معالجة الإيداع");
      setSelected(null);
      setNote("");
      setMessage(json.message || (nextStatus === "approved" ? "تم اعتماد الإيداع." : "تم رفض الإيداع."));
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذرت معالجة الإيداع");
    } finally {
      setBusy(false);
    }
  }

  const selectedHasScreenshot = Boolean(selected?.hasScreenshot || selected?.screenshotStorage === "mongodb" || selected?.screenshotPath);

  return (
    <AdminPageFrame title="مراجعة الإيداعات">
      <div dir="rtl" className="space-y-5 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black">طلبات الإيداع ومراجعة إثبات الدفع</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">راجع مبلغ التحويل والشبكة وTX Hash وصورة الإثبات قبل اعتماد الرصيد أو رفض الطلب مع توضيح السبب.</p>
          </div>
          <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold text-slate-200 disabled:opacity-50">
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> تحديث الطلبات
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-amber-400/20 bg-[#08111e] p-4"><div className="flex items-center gap-2 text-xs text-slate-400"><Clock3 size={16} className="text-amber-200" />قيد المراجعة</div><div className="mt-3 text-3xl font-black text-amber-200">{stats.pending}</div><p className="mt-1 text-xs text-slate-500">مجموع القيم المعلقة: {money(stats.pendingAmount)}</p></div>
          <div className="rounded-2xl border border-emerald-400/20 bg-[#08111e] p-4"><div className="text-xs text-slate-400">إيداعات معتمدة</div><div className="mt-3 text-3xl font-black text-emerald-200">{stats.approved}</div><p className="mt-1 text-xs text-slate-500">تُضاف إلى رصيد الإيداع مرة واحدة</p></div>
          <div className="rounded-2xl border border-red-400/20 bg-[#08111e] p-4"><div className="text-xs text-slate-400">إيداعات مرفوضة</div><div className="mt-3 text-3xl font-black text-red-200">{stats.rejected}</div><p className="mt-1 text-xs text-slate-500">يُحفظ سبب الرفض في سجل المستخدم</p></div>
          <div className="rounded-2xl border border-white/10 bg-[#08111e] p-4"><div className="text-xs text-slate-400">إجمالي الطلبات المحمّلة</div><div className="mt-3 text-3xl font-black">{stats.total}</div><p className="mt-1 text-xs text-slate-500">الأحدث حتى حد 500 طلب</p></div>
        </div>

        {error && <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/[0.06] p-4 text-sm text-red-200">{error}</div>}
        {message && <div role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-sm text-emerald-200">{message}</div>}

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_190px_180px]">
          <div className="relative">
            <Search size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث بالاسم أو البريد أو TX Hash أو رقم الطلب" className="w-full rounded-xl border border-slate-700 bg-[#08111e] py-3 pr-10 pl-4 text-sm outline-none focus:border-cyan-300/30" />
          </div>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="rounded-xl border border-slate-700 bg-[#08111e] px-4 py-3 text-sm outline-none">
            <option value="pending">قيد المراجعة</option><option value="approved">معتمد</option><option value="rejected">مرفوض</option><option value="all">كل الحالات</option>
          </select>
          <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="rounded-xl border border-slate-700 bg-[#08111e] px-4 py-3 text-sm outline-none">
            <option value="newest">الأحدث أولًا</option><option value="oldest">الأقدم أولًا</option>
          </select>
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#08111e]">
          {loading ? (
            <div className="p-12 text-center text-slate-500">جاري تحميل طلبات الإيداع...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-500">{search ? "لا توجد نتائج مطابقة للبحث." : "لا توجد طلبات ضمن الحالة المختارة."}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-right text-sm">
                <thead className="border-b border-white/10 bg-white/[0.025] text-xs text-slate-500">
                  <tr><th className="px-4 py-4">المستخدم</th><th className="px-4 py-4">المبلغ</th><th className="px-4 py-4">العملة / الشبكة</th><th className="px-4 py-4">TX Hash</th><th className="px-4 py-4">تاريخ الطلب</th><th className="px-4 py-4">الحالة</th><th className="px-4 py-4">الإجراء</th></tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row._id} className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02]">
                      <td className="px-4 py-4"><div className="font-bold">{userValue(row.userId, "name") || userValue(row.userId, "username") || "مستخدم"}</div><div className="mt-1 text-xs text-slate-500">{userValue(row.userId, "email") || "—"}</div><div className="mt-1 max-w-[180px] truncate text-[10px] text-slate-600">{row._id}</div></td>
                      <td className="px-4 py-4 font-black">{money(row.amount, row.asset)}</td>
                      <td className="px-4 py-4"><div>{row.asset}</div><div className="mt-1 text-xs text-slate-500">{row.network}</div></td>
                      <td className="max-w-[190px] px-4 py-4"><div className="truncate font-mono text-xs text-cyan-100">{row.txHash || "—"}</div></td>
                      <td className="px-4 py-4 text-xs text-slate-400">{date(row.createdAt)}</td>
                      <td className="px-4 py-4"><span className={"inline-flex rounded-full border px-3 py-1 text-xs font-bold " + statusStyle(row.status)}>{statusLabel(row.status)}</span></td>
                      <td className="px-4 py-4"><button type="button" onClick={() => openReview(row)} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2 text-xs font-black text-[#03111c] hover:bg-cyan-200"><FileImage size={15} /> مراجعة الإثبات</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="مراجعة إثبات الإيداع">
            <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/10 bg-[#07101d] p-3 shadow-2xl sm:p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div><div className="text-[10px] font-bold tracking-widest text-cyan-300">DEPOSIT REVIEW</div><h2 className="mt-1 text-lg font-black">مراجعة طلب الإيداع</h2><p className="mt-1 max-w-[min(78vw,680px)] break-all text-[10px] text-slate-500">رقم الطلب: {selected._id}</p></div>
                <button type="button" onClick={() => { setSelected(null); setError(""); }} className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:bg-white/5" aria-label="إغلاق"><X size={19} /></button>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.025] p-2.5"><div className="text-xs text-slate-500">صاحب الطلب</div><div className="mt-1 text-sm font-bold">{userValue(selected.userId, "name") || userValue(selected.userId, "username") || "مستخدم"}</div><div className="mt-1 break-all text-[11px] text-slate-400">{userValue(selected.userId, "email") || "—"}</div></div>
                <div className="rounded-xl border border-white/10 bg-white/[0.025] p-2.5"><div className="text-xs text-slate-500">المبلغ المطلوب</div><div className="mt-1 text-lg font-black text-cyan-200">{money(selected.amount, selected.asset)}</div><div className="mt-1 text-xs text-slate-500">الشبكة: {selected.network}</div></div>
                <div className="rounded-xl border border-white/10 bg-white/[0.025] p-2.5"><div className="text-xs text-slate-500">حالة الطلب</div><div className="mt-2"><span className={"inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold " + statusStyle(selected.status)}>{statusLabel(selected.status)}</span></div><div className="mt-2 text-xs text-slate-500">{date(selected.createdAt)}</div></div>
              </div>

              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.025] p-2.5"><div className="text-xs text-slate-500">عنوان الإيداع الذي استقبل التحويل</div><div className="mt-1 break-all font-mono text-xs">{selected.address || "—"}</div></div>
                <div className="rounded-xl border border-white/10 bg-white/[0.025] p-2.5"><div className="text-xs text-slate-500">TX Hash</div><div className="mt-1 break-all font-mono text-xs text-cyan-100">{selected.txHash || "لم يضف المستخدم رقم معاملة."}</div>{selected.confirmations !== undefined && <div className="mt-1 text-[10px] text-slate-500">التأكيدات: {selected.confirmations}</div>}</div>
              </div>

              <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.025] p-2.5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold">صورة إثبات الدفع</h3><span className="text-[10px] text-slate-500">اضغط على الصورة لتكبيرها</span></div>
                {selectedHasScreenshot ? (
                  proofLoadError ? (
                    <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.04] p-4 text-center text-xs text-amber-200">تعذر تحميل صورة الإثبات من الخادم. تحقق من التخزين ثم أعد المحاولة.</div>
                  ) : (
                  <button type="button" onClick={() => setProofExpanded(true)} className="block w-full cursor-zoom-in rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300/60" aria-label="تكبير صورة إثبات الدفع">
                    <img src={"/api/admin/deposits/file?id=" + encodeURIComponent(selected._id)} alt="إثبات الدفع" onError={() => setProofLoadError(true)} className="mx-auto max-h-[300px] w-full rounded-lg border border-white/10 bg-black object-contain" />
                  </button>
                  )
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-500">لا توجد صورة إثبات محفوظة لهذا الطلب. راجع TX Hash قبل اتخاذ القرار.</div>
                )}
              </div>

              {selected.status === "pending" ? (
                <div className="mt-3">
                  <label className="mb-1.5 block text-xs font-bold text-slate-300">ملاحظة الإدارة (سبب الرفض مطلوب عند الرفض)</label>
                  <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={1000} placeholder="اكتب ملاحظة أو سبب الرفض..." className="w-full rounded-lg border border-white/10 bg-[#030b12] p-2.5 text-xs outline-none focus:border-cyan-300/30" />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void review("approved")} disabled={busy} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-400 px-3 py-2 text-sm font-black text-[#03111c] disabled:opacity-50"><CheckCircle2 size={17} />{busy ? "جاري المعالجة..." : "اعتماد الإيداع وإضافة الرصيد"}</button>
                    <button type="button" onClick={() => void review("rejected")} disabled={busy} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-500 px-3 py-2 text-sm font-black text-white disabled:opacity-50"><XCircle size={17} />رفض الإيداع</button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-xs text-slate-400">تمت معالجة هذا الطلب بالفعل: <b>{statusLabel(selected.status)}</b>{selected.adminNote && <p className="mt-2">ملاحظة الإدارة: {selected.adminNote}</p>}</div>
              )}
              {error && <div role="alert" className="mt-3 rounded-lg border border-red-500/20 bg-red-500/[0.06] p-2.5 text-xs text-red-200">{error}</div>}
              <div className="mt-3 flex justify-end"><button type="button" onClick={() => { setSelected(null); setProofExpanded(false); }} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/5">إغلاق المراجعة</button></div>
            </div>
            {proofExpanded && selectedHasScreenshot && !proofLoadError && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-3" role="dialog" aria-modal="true" aria-label="تكبير صورة إثبات الدفع" onClick={() => setProofExpanded(false)}>
                <button type="button" onClick={() => setProofExpanded(false)} className="absolute right-4 top-4 rounded-lg border border-white/20 bg-black/60 p-2 text-white" aria-label="إغلاق الصورة"><X size={20} /></button>
                <img src={"/api/admin/deposits/file?id=" + encodeURIComponent(selected._id)} alt="إثبات الدفع مكبر" onClick={(event) => event.stopPropagation()} onError={() => { setProofLoadError(true); setProofExpanded(false); }} className="max-h-[90vh] max-w-full rounded-lg object-contain" />
              </div>
            )}
          </div>
        )}
      </div>
    </AdminPageFrame>
  );
}
