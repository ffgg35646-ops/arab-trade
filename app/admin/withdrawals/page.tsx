"use client";

import AdminPageFrame from "@/components/AdminPageFrame";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpFromLine, CheckCircle2, Clock3, Copy, Eye, RefreshCw, Search, ShieldCheck, Wallet, X, XCircle } from "lucide-react";

type Status = "pending" | "approved" | "processing" | "rejected" | "failed" | "completed";
type Source = "wallet" | "package";
type UserRef = { _id?: string; name?: string; username?: string; email?: string } | string | null | undefined;
type PackageRef = { _id?: string; packageName?: string } | string | null | undefined;
type Withdrawal = {
  _id: string;
  userId?: UserRef;
  userPackageId?: PackageRef;
  source?: Source;
  isFirstPackageWithdrawal?: boolean;
  asset: string;
  network: string;
  amount: number;
  fee?: number;
  receiveAmount?: number;
  address: string;
  status: Status;
  adminNote?: string;
  txHash?: string;
  createdAt: string;
  completedAt?: string;
};

function money(value: unknown, asset = "USDT") {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }) + " " + asset;
}

function statusInfo(status: Status) {
  const values: Record<Status, { label: string; styles: string }> = {
    pending: { label: "قيد المراجعة", styles: "border-amber-400/20 bg-amber-400/10 text-amber-200" },
    approved: { label: "تمت الموافقة", styles: "border-blue-400/20 bg-blue-400/10 text-blue-200" },
    processing: { label: "قيد التنفيذ", styles: "border-violet-400/20 bg-violet-400/10 text-violet-200" },
    rejected: { label: "مرفوض", styles: "border-red-400/20 bg-red-400/10 text-red-200" },
    failed: { label: "فشل التنفيذ", styles: "border-red-400/20 bg-red-400/10 text-red-200" },
    completed: { label: "مكتمل", styles: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" },
  };
  return values[status] || values.pending;
}

function userName(user: UserRef) {
  return user && typeof user === "object" ? user.name || user.username || "مستخدم" : "مستخدم";
}
function userEmail(user: UserRef) {
  return user && typeof user === "object" ? user.email || "" : "";
}
function packageName(value: PackageRef) {
  return value && typeof value === "object" ? value.packageName || "حساب باقة" : value ? "حساب باقة" : "—";
}
function formatDate(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("ar-EG", { timeZone: "Africa/Cairo" });
}

export default function AdminWithdrawalsPage() {
  const [rows, setRows] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("pending");
  const [sourceFilter, setSourceFilter] = useState<"all" | Source>("all");
  const [selected, setSelected] = useState<Withdrawal | null>(null);
  const [note, setNote] = useState("");
  const [busyStatus, setBusyStatus] = useState<Status | "">("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/withdrawals?limit=500", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.message || "تعذر تحميل طلبات السحب");
      }
      setRows(Array.isArray(json.withdrawals) ? json.withdrawals : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل طلبات السحب");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => { void load(); });
    const timer = window.setInterval(() => { void load(true); }, 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const stats = useMemo(() => ({
    total: rows.length,
    pending: rows.filter((r) => r.status === "pending").length,
    approved: rows.filter((r) => r.status === "approved" || r.status === "processing").length,
    completed: rows.filter((r) => r.status === "completed").length,
    rejected: rows.filter((r) => r.status === "rejected" || r.status === "failed").length,
    packagePending: rows.filter((r) => r.status === "pending" && r.source === "package").length,
    walletPending: rows.filter((r) => r.status === "pending" && r.source !== "package").length,
    pendingAmount: rows.filter((r) => ["pending", "approved", "processing"].includes(r.status))
      .reduce((sum, r) => sum + Number(r.amount || 0), 0),
  }), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...rows]
      .filter((r) => statusFilter === "all" || r.status === statusFilter)
      .filter((r) => sourceFilter === "all" || (sourceFilter === "package" ? r.source === "package" : r.source !== "package"))
      .filter((r) => !q || [
        r._id, r.asset, r.network, r.address, r.txHash, r.status, r.adminNote,
        packageName(r.userPackageId), userName(r.userId), userEmail(r.userId),
      ].some((v) => String(v || "").toLowerCase().includes(q)))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [rows, search, statusFilter, sourceFilter]);

  async function updateStatus(nextStatus: "approved" | "rejected" | "completed") {
    if (!selected) return;
    setBusyStatus(nextStatus);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/withdrawals", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selected._id,
          status: nextStatus,
          adminNote: note.trim(),
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.message || "تعذرت معالجة طلب السحب");
      }
      setMessage(
        nextStatus === "approved"
          ? "تمت الموافقة على الطلب ونقله إلى قيد التنفيذ."
          : nextStatus === "rejected"
            ? "تم رفض الطلب وتسوية الرصيد المرتبط به."
            : "تم تسجيل السحب كمكتمل."
      );
      setSelected(null);
      setNote("");
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذرت معالجة طلب السحب");
    } finally {
      setBusyStatus("");
    }
  }

  function openDetails(row: Withdrawal) {
    setSelected(row);
    setNote(row.adminNote || "");
    setError("");
    setMessage("");
  }

  async function copyAddress(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("تم نسخ عنوان المحفظة.");
    } catch {
      setMessage("تعذر النسخ تلقائيًا؛ انسخ العنوان يدويًا.");
    }
  }

  return (
    <AdminPageFrame title="السحوبات">
      <div dir="rtl" className="mx-auto w-full max-w-[1500px] space-y-6">
        <section className="relative overflow-hidden rounded-[30px] border border-cyan-300/15 bg-gradient-to-br from-[#0d2030] via-[#08111e] to-[#06101a] p-6 md:p-8">
          <div className="pointer-events-none absolute -left-10 -top-16 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200"><ArrowUpFromLine size={25} /></div>
              <div>
                <h1 className="text-2xl font-black text-white md:text-3xl">إدارة طلبات السحب</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">مراجعة طلبات السحب العام وطلبات سحب أرباح الباقات، ومتابعة الموافقة والتنفيذ والرفض من شاشة واحدة.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="/admin/payments#package-withdrawal-settings" className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm font-bold text-emerald-100 transition hover:bg-emerald-300/15">
                إعداد سحب أرباح الباقات
              </a>
              <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold text-slate-200 transition hover:border-cyan-300/30 disabled:opacity-50">
                <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> تحديث البيانات
              </button>
            </div>
          </div>
          <div className="relative mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-[#030b12]/65 p-4"><div className="flex items-center gap-2 text-xs text-slate-400"><Clock3 size={16} className="text-amber-300" />قيد المراجعة</div><div className="mt-3 text-3xl font-black text-amber-200">{stats.pending}</div><p className="mt-1 text-xs text-slate-500">عام: {stats.walletPending} · باقات: {stats.packagePending}</p></div>
            <div className="rounded-2xl border border-white/10 bg-[#030b12]/65 p-4"><div className="flex items-center gap-2 text-xs text-slate-400"><ShieldCheck size={16} className="text-blue-300" />موافق عليها / قيد التنفيذ</div><div className="mt-3 text-3xl font-black text-blue-200">{stats.approved}</div><p className="mt-1 text-xs text-slate-500">تحتاج إنهاء التحويل بعد الموافقة</p></div>
            <div className="rounded-2xl border border-white/10 bg-[#030b12]/65 p-4"><div className="flex items-center gap-2 text-xs text-slate-400"><CheckCircle2 size={16} className="text-emerald-300" />عمليات مكتملة</div><div className="mt-3 text-3xl font-black text-emerald-200">{stats.completed}</div><p className="mt-1 text-xs text-slate-500">من إجمالي {stats.total} طلب</p></div>
            <div className="rounded-2xl border border-white/10 bg-[#030b12]/65 p-4"><div className="flex items-center gap-2 text-xs text-slate-400"><Wallet size={16} className="text-cyan-300" />إجمالي المبالغ المفتوحة</div><div className="mt-3 text-2xl font-black text-cyan-200">{money(stats.pendingAmount)}</div><p className="mt-1 text-xs text-slate-500">طلبات لم تُغلق بعد</p></div>
          </div>
        </section>

        {message && <div role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-sm text-emerald-200">{message}</div>}
        {error && <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/[0.06] p-4 text-sm text-red-200">{error}</div>}

        <section className="rounded-2xl border border-white/10 bg-[#08111e] p-4 md:p-5">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
            <label className="relative block">
              <Search size={17} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالإيميل أو المستخدم أو العنوان أو رقم الطلب..." className="w-full rounded-xl border border-white/10 bg-[#030b12] py-3 pr-11 pl-4 text-sm outline-none focus:border-cyan-300/30" />
            </label>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as "all" | Source)} className="rounded-xl border border-white/10 bg-[#030b12] px-4 py-3 text-sm">
              <option value="all">كل مصادر السحب</option><option value="wallet">رصيد السحب العام</option><option value="package">أرباح الباقات</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | Status)} className="rounded-xl border border-white/10 bg-[#030b12] px-4 py-3 text-sm">
              <option value="pending">قيد المراجعة</option><option value="approved">تمت الموافقة</option><option value="processing">قيد التنفيذ</option><option value="completed">مكتمل</option><option value="rejected">مرفوض</option><option value="failed">فشل التنفيذ</option><option value="all">كل الحالات</option>
            </select>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {([["pending","قيد المراجعة"],["approved","تمت الموافقة"],["completed","مكتمل"],["rejected","مرفوض"],["all","كل الطلبات"]] as const).map(([value,label]) => (
              <button key={value} type="button" onClick={() => setStatusFilter(value)} className={statusFilter === value ? "rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-bold text-cyan-100" : "rounded-xl border border-white/10 px-4 py-2 text-xs text-slate-400 transition hover:bg-white/[0.04]"}>
                {label}{value === "pending" && <span className="mr-2 rounded-full bg-amber-300/10 px-2 py-0.5 text-amber-200">{stats.pending}</span>}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500"><span>إجمالي الطلبات: <b className="text-slate-200">{stats.total}</b></span><span>المعروض: <b className="text-slate-200">{filtered.length}</b></span></div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#08111e]">
          {loading ? <div className="p-14 text-center text-slate-400">جاري تحميل طلبات السحب...</div> : filtered.length === 0 ? (
            <div className="p-14 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-500"><ArrowUpFromLine size={24} /></div><p className="mt-4 font-bold text-slate-300">لا توجد طلبات مطابقة</p><p className="mt-1 text-sm text-slate-500">غيّر الحالة أو مصدر السحب أو عبارة البحث.</p></div>
          ) : (
            <div className="overflow-x-auto"><table className="min-w-full text-right text-sm">
              <thead className="border-b border-white/10 bg-[#0d1a29] text-xs text-slate-400"><tr><th className="px-4 py-4">المستخدم</th><th className="px-4 py-4">مصدر السحب</th><th className="px-4 py-4">المبلغ</th><th className="px-4 py-4">الشبكة / العنوان</th><th className="px-4 py-4">الحالة</th><th className="px-4 py-4">التاريخ</th><th className="px-4 py-4">تفاصيل</th></tr></thead>
              <tbody>{filtered.map((row) => { const info = statusInfo(row.status); return (
                <tr key={row._id} className="border-b border-white/[0.06] last:border-0 transition hover:bg-white/[0.02]">
                  <td className="px-4 py-4"><div className="font-bold text-white">{userName(row.userId)}</div><div className="mt-1 text-xs text-slate-500">{userEmail(row.userId) || "—"}</div></td>
                  <td className="px-4 py-4"><div className="font-bold text-slate-200">{row.source === "package" ? "سحب باقة" : "السحب العام"}</div>{row.source === "package" && <div className="mt-1 text-xs text-cyan-200">{packageName(row.userPackageId)}</div>}{row.source === "package" && <div className="mt-1 text-[10px] text-amber-200">{row.isFirstPackageWithdrawal ? "السحبة الأولى — حسب قيمة الباقة" : "السحبة الثانية / سحب لاحق — حسب الإحالات النشطة"}</div>}</td>
                  <td className="px-4 py-4"><div className="font-black text-white">{money(row.amount,row.asset)}</div><div className="mt-1 text-xs text-slate-500">الرسوم: {money(row.fee,row.asset)}</div><div className="mt-1 text-xs text-emerald-200">الصافي: {money(row.receiveAmount,row.asset)}</div></td>
                  <td className="max-w-[280px] px-4 py-4"><div className="text-slate-300">{row.network || "—"}</div><div className="mt-1 truncate font-mono text-xs text-slate-500" title={row.address}>{row.address || "—"}</div></td>
                  <td className="px-4 py-4"><span className={"inline-flex whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-bold " + info.styles}>{info.label}</span></td>
                  <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-500">{formatDate(row.createdAt)}</td>
                  <td className="px-4 py-4"><button type="button" onClick={() => openDetails(row)} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-3 py-2 text-xs font-black text-[#03111c] transition hover:bg-cyan-200"><Eye size={15} /> مراجعة</button></td>
                </tr>
              );})}</tbody>
            </table></div>
          )}
        </section>
      </div>

      {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="تفاصيل طلب السحب">
        <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-cyan-300/15 bg-[#07131f] p-5 shadow-2xl md:p-7">
          <div className="mb-6 flex items-start justify-between gap-3"><div><div className="text-xs font-bold tracking-widest text-cyan-300">WITHDRAWAL REVIEW</div><h2 className="mt-2 text-2xl font-black text-white">تفاصيل طلب السحب</h2><p className="mt-1 break-all text-xs text-slate-500">رقم الطلب: {selected._id}</p></div><button type="button" onClick={() => { setSelected(null); setNote(""); }} className="rounded-xl border border-white/10 p-2 text-slate-400 hover:bg-white/5" aria-label="إغلاق"><X size={19} /></button></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div className="text-xs text-slate-500">المستخدم</div><div className="mt-2 font-black text-white">{userName(selected.userId)}</div><div className="mt-1 break-all text-sm text-slate-400">{userEmail(selected.userId) || "—"}</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div className="text-xs text-slate-500">مصدر الرصيد</div><div className="mt-2 font-black text-white">{selected.source === "package" ? "أرباح باقة" : "رصيد السحب العام"}</div>{selected.source === "package" && <div className="mt-1 text-sm text-cyan-200">{packageName(selected.userPackageId)}</div>}</div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div className="text-xs text-slate-500">المبلغ المطلوب</div><div className="mt-2 text-2xl font-black text-cyan-200">{money(selected.amount,selected.asset)}</div><div className="mt-1 text-xs text-slate-500">الرسوم {money(selected.fee,selected.asset)} · الصافي {money(selected.receiveAmount,selected.asset)}</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div className="text-xs text-slate-500">الحالة / تاريخ الطلب</div><div className="mt-2"><span className={"inline-flex rounded-full border px-3 py-1 text-xs font-bold " + statusInfo(selected.status).styles}>{statusInfo(selected.status).label}</span></div><div className="mt-2 text-xs text-slate-500">{formatDate(selected.createdAt)}</div></div>
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div className="mb-2 text-xs text-slate-500">عنوان الاستلام</div><div className="flex items-start justify-between gap-3"><p className="break-all font-mono text-sm leading-6 text-slate-200">{selected.address}</p><button type="button" onClick={() => void copyAddress(selected.address)} className="shrink-0 rounded-lg border border-white/10 p-2 text-cyan-200 hover:bg-white/5" aria-label="نسخ العنوان"><Copy size={15} /></button></div><div className="mt-3 text-xs text-slate-500">الشبكة: <span className="text-slate-300">{selected.network}</span> · الأصل: <span className="text-slate-300">{selected.asset}</span></div>{selected.txHash && <div className="mt-3 break-all text-xs text-slate-500">TX Hash: <span className="font-mono text-cyan-200">{selected.txHash}</span></div>}</div>
          <div className="mt-4"><label className="mb-2 block text-sm font-bold text-slate-300">ملاحظة الإدارة / مرجع التحويل</label><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} placeholder="اكتب ملاحظة واضحة تظهر في سجل العملية..." className="w-full rounded-xl border border-white/10 bg-[#030b12] p-4 text-sm outline-none focus:border-cyan-300/30" /></div>
          <div className="mt-5 flex flex-wrap gap-3">
            {selected.status === "pending" && <>
              <button type="button" onClick={() => void updateStatus("approved")} disabled={Boolean(busyStatus)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 font-black text-[#03111c] disabled:opacity-50"><CheckCircle2 size={17} />{busyStatus === "approved" ? "جاري الموافقة..." : "موافقة ونقل للتنفيذ"}</button>
              <button type="button" onClick={() => void updateStatus("rejected")} disabled={Boolean(busyStatus)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 font-black text-white disabled:opacity-50"><XCircle size={17} />{busyStatus === "rejected" ? "جاري الرفض..." : "رفض الطلب"}</button>
            </>}
            {(selected.status === "approved" || selected.status === "processing") && <>
              <button type="button" onClick={() => void updateStatus("completed")} disabled={Boolean(busyStatus)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 font-black text-[#03111c] disabled:opacity-50"><CheckCircle2 size={17} />{busyStatus === "completed" ? "جاري الإنهاء..." : "تسجيل التحويل كمكتمل"}</button>
              <button type="button" onClick={() => void updateStatus("rejected")} disabled={Boolean(busyStatus)} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 font-bold text-red-200 disabled:opacity-50"><XCircle size={17} />رفض / إرجاع الرصيد</button>
            </>}
            {["completed","rejected","failed"].includes(selected.status) && <div className="w-full rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm text-slate-400">هذه العملية مغلقة ولا يمكن تغيير حالتها من هذه الشاشة.{selected.adminNote && <p className="mt-2 text-slate-300">ملاحظة محفوظة: {selected.adminNote}</p>}</div>}
            <button type="button" onClick={() => { setSelected(null); setNote(""); }} className="rounded-xl border border-white/10 px-5 py-3 text-sm font-bold text-slate-300 hover:bg-white/5">إغلاق</button>
          </div>
        </div>
      </div>}
    </AdminPageFrame>
  );
}
