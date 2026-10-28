"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import AdminPageFrame from "@/components/AdminPageFrame";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  Filter,
  RefreshCw,
  Search,
  Settings2,
  WalletCards,
  XCircle,
} from "lucide-react";

type Plan = { _id: string; name: string; withdrawalMinimum?: number; enabled?: boolean; price?: number };
type UserRef = { email?: string; username?: string } | string | null;
type PackageRef = { name?: string } | null;
type UserPackageRef = { packageName?: string } | null;
type Allocation = {
  amount: number;
  packageId?: PackageRef;
  userPackageId?: UserPackageRef;
};
type Request = {
  _id: string;
  type?: string;
  generalSource?: "wallet" | "deposit";
  amount: number;
  grossAmount?: number;
  feePercent?: number;
  feeAmount?: number;
  payoutAmount?: number;
  conversionAsset?: string | null;
  conversionOrderId?: string | null;
  conversionQuantity?: number | null;
  conversionPrice?: number | null;
  tradingFeeAmount?: number;
  asset?: string;
  network?: string;
  payoutAddress?: string;
  status: string;
  createdAt?: string;
  reviewedAt?: string | null;
  userId?: UserRef;
  packageId?: PackageRef;
  userPackageId?: UserPackageRef;
  allocations?: Allocation[];
};

type StatusFilter = "all" | "pending" | "approved" | "rejected";

const money = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 8 });

function userEmail(user: UserRef | undefined) {
  if (user && typeof user === "object") return user.email || user.username || "مستخدم";
  return typeof user === "string" ? user : "مستخدم";
}

function requestSource(request: Request) {
  if (request.type === "general") return request.generalSource === "deposit" ? "السحب العام · رصيد الإيداع" : "السحب العام";
  return request.packageId?.name || request.userPackageId?.packageName || "سحب أرباح الباقات (مجمّع)";
}

function statusLabel(status: string) {
  if (status === "pending") return "قيد المراجعة";
  if (status === "approved") return "مقبول";
  if (status === "rejected") return "مرفوض";
  return status || "غير معروف";
}

function statusClass(status: string) {
  if (status === "approved") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  if (status === "rejected") return "border-rose-400/20 bg-rose-400/10 text-rose-300";
  if (status === "pending") return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  return "border-slate-600 bg-slate-800 text-slate-300";
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ar-EG");
}

export default function AdminWithdrawalsPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [minimums, setMinimums] = useState<Record<string, string>>({});
  const [generalMinimum, setGeneralMinimum] = useState("0");
  const [referralUnlockPercent, setReferralUnlockPercent] = useState("50");
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error">("success");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [clock, setClock] = useState(() => Date.now());
  const pageSize = 10;
  const approvedVisibleMs = 24 * 60 * 60 * 1000;

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/admin/withdrawals", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        setMessage(json.message || "تعذر تحميل السحوبات");
        setMessageKind("error");
        return;
      }
      setPlans(Array.isArray(json.plans) ? json.plans : []);
      setRequests(Array.isArray(json.requests) ? json.requests : []);
      setGeneralMinimum(String(json.generalMinimum ?? 0));
      setReferralUnlockPercent(String(json.packageReferralUnlockPercent ?? 50));
    } catch {
      setMessage("تعذر الاتصال بخدمة السحوبات");
      setMessageKind("error");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/withdrawals", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        setMessage(json.message || "لم تنجح العملية");
        setMessageKind("error");
      } else {
        const successMessage =
          body.action === "approve" ? "تم قبول طلب السحب وتحديث الرصيد" :
          body.action === "reject" ? "تم رفض الطلب وإرجاع المبلغ وفقًا لقواعد النظام" :
          "تم حفظ الإعداد بنجاح";
        setMessage(successMessage);
        setMessageKind("success");
      }
      await load();
    } catch {
      setMessage("تعذر الاتصال بالخادم");
      setMessageKind("error");
    } finally {
      setBusy(false);
    }
  }

  // لا نحذف السجلات من قاعدة البيانات؛ نُخفي الطلب المقبول من واجهة الأدمن بعد 24 ساعة.
  const visibleRequests = useMemo(() => requests.filter((request) => {
    if (request.status !== "approved") return true;
    const reviewedTime = request.reviewedAt
      ? new Date(request.reviewedAt).getTime()
      : request.createdAt
        ? new Date(request.createdAt).getTime()
        : Number.NaN;
    return !Number.isFinite(reviewedTime) || clock - reviewedTime < approvedVisibleMs;
  }), [requests, clock]);

  const counts = useMemo(() => ({
    all: visibleRequests.length,
    pending: visibleRequests.filter((request) => request.status === "pending").length,
    approved: visibleRequests.filter((request) => request.status === "approved").length,
    rejected: visibleRequests.filter((request) => request.status === "rejected").length,
  }), [visibleRequests]);

  const filteredRequests = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return visibleRequests.filter((request) => {
      if (statusFilter !== "all" && request.status !== statusFilter) return false;
      if (!normalized) return true;
      const searchable = [
        request._id,
        userEmail(request.userId),
        requestSource(request),
        request.network,
        request.payoutAddress,
        request.asset,
        request.conversionOrderId,
      ].filter(Boolean).join(" ").toLowerCase();
      return searchable.includes(normalized);
    });
  }, [visibleRequests, query, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredRequests.length / pageSize));
  const safePage = Math.min(currentPage, pageCount);
  const pageRequests = useMemo(
    () => filteredRequests.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredRequests, safePage],
  );
  const pageNumbers: (number | "ellipsis")[] = pageCount <= 7
    ? Array.from({ length: pageCount }, (_, index) => index + 1)
    : safePage <= 4
      ? [1, 2, 3, 4, 5, "ellipsis", pageCount]
      : safePage >= pageCount - 3
        ? [1, "ellipsis", pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount]
        : [1, "ellipsis", safePage - 1, safePage, safePage + 1, "ellipsis", pageCount];

  useEffect(() => {
    if (currentPage > pageCount) setCurrentPage(pageCount);
  }, [currentPage, pageCount]);

  const filterOptions: { value: StatusFilter; label: string; count: number }[] = [
    { value: "pending", label: "قيد المراجعة", count: counts.pending },
    { value: "all", label: "كل الطلبات", count: counts.all },
    { value: "approved", label: "مقبولة", count: counts.approved },
    { value: "rejected", label: "مرفوضة", count: counts.rejected },
  ];

  return (
    <AdminPageFrame title="السحوبات">
      <div dir="rtl" className="space-y-6 p-3 text-white sm:p-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
              <WalletCards size={23} />
            </div>
            <div>
              <h2 className="text-xl font-black sm:text-2xl">إدارة السحوبات</h2>
              <p className="mt-1 text-sm text-slate-400">مراجعة الطلبات، متابعة صافي المبالغ، والتحكم في إعدادات السحب.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={refreshing || busy}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            تحديث البيانات
          </button>
        </header>

        {message && (
          <div role="status" className={"flex items-start gap-2 rounded-xl border px-4 py-3 text-sm " + (
            messageKind === "error"
              ? "border-rose-500/25 bg-rose-500/[0.07] text-rose-200"
              : "border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-200"
          )}>
            {messageKind === "error" ? <AlertCircle size={18} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0" />}
            <span>{message}</span>
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-400">إجمالي الطلبات</span>
              <div className="rounded-xl bg-slate-700/30 p-2 text-slate-300"><WalletCards size={18} /></div>
            </div>
            <div className="mt-3 text-3xl font-black tabular-nums">{counts.all.toLocaleString("ar-EG")}</div>
            <p className="mt-1 text-xs text-slate-500">الطلبات التي تم تحميلها</p>
          </div>
          <div className="rounded-2xl border border-amber-400/20 bg-[#08111e] p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-400">تحتاج مراجعة</span>
              <div className="rounded-xl bg-amber-400/10 p-2 text-amber-200"><Clock3 size={18} /></div>
            </div>
            <div className="mt-3 text-3xl font-black tabular-nums text-amber-200">{counts.pending.toLocaleString("ar-EG")}</div>
            <p className="mt-1 text-xs text-slate-500">طلبات تنتظر قرار الأدمن</p>
          </div>
          <div className="rounded-2xl border border-emerald-400/20 bg-[#08111e] p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-400">تم قبولها</span>
              <div className="rounded-xl bg-emerald-400/10 p-2 text-emerald-300"><CheckCircle2 size={18} /></div>
            </div>
            <div className="mt-3 text-3xl font-black tabular-nums text-emerald-300">{counts.approved.toLocaleString("ar-EG")}</div>
            <p className="mt-1 text-xs text-slate-500">طلبات تمت الموافقة عليها</p>
          </div>
          <div className="rounded-2xl border border-rose-400/20 bg-[#08111e] p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-400">تم رفضها</span>
              <div className="rounded-xl bg-rose-400/10 p-2 text-rose-300"><XCircle size={18} /></div>
            </div>
            <div className="mt-3 text-3xl font-black tabular-nums text-rose-300">{counts.rejected.toLocaleString("ar-EG")}</div>
            <p className="mt-1 text-xs text-slate-500">طلبات تم رفضها</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#08111e]">
          <button
            type="button"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((value) => !value)}
            className="flex w-full items-center justify-between gap-3 p-4 text-right transition hover:bg-white/[0.025] sm:p-5"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-400/10 text-blue-300"><Settings2 size={20} /></span>
              <span>
                <span className="block font-black">إعدادات السحب</span>
                <span className="mt-1 block text-xs text-slate-400">الحد العام، نسبة الإحالات، والحد الأدنى لكل باقة</span>
              </span>
            </span>
            {settingsOpen ? <ChevronUp size={19} className="text-slate-400" /> : <ChevronDown size={19} className="text-slate-400" />}
          </button>

          {settingsOpen && (
            <div className="space-y-4 border-t border-slate-800 p-4 sm:p-5">
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-slate-700 bg-[#0b1422] p-4">
                  <h3 className="font-bold">الحد الأدنى للسحب العام</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-400">تعيين أقل مبلغ مسموح به لطلب السحب العام. القيمة 0 تعني أن السحب العام غير مفعّل حتى تحديد حد أدنى.</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">الحد الأدنى للسحب العام</span>
                      <input aria-label="الحد الأدنى للسحب العام" className="w-full rounded-xl border border-slate-700 bg-[#050a13] px-3 py-2.5 text-white outline-none transition focus:border-blue-500" type="number" min="0" step="any" value={generalMinimum} onChange={(event) => setGeneralMinimum(event.target.value)} />
                    </label>
                    <button type="button" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold transition hover:bg-blue-500 disabled:opacity-50" disabled={busy} onClick={() => void act({ action: "generalMinimum", minimum: Number(generalMinimum) })}>حفظ</button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-700 bg-[#0b1422] p-4">
                  <h3 className="font-bold">فتح السحب بالإحالات النشطة</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-400">النسبة من إيداعات USDT المعتمدة للحسابات المحالة، وهي مستقلة عن عمولة الإحالة.</p>
                  <div className="mt-3 rounded-lg bg-[#050a13] px-3 py-2 text-xs text-slate-400">
                    مثال: إيداعات 1,000 USDT تفتح سعة إضافية قدرها <strong className="text-cyan-200">{money(1000 * (Number(referralUnlockPercent) || 0) / 100)} USDT</strong>.
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">نسبة فتح السحب بالإحالات</span>
                      <input aria-label="نسبة فتح السحب بالإحالات" className="w-full rounded-xl border border-slate-700 bg-[#050a13] px-3 py-2.5 text-white outline-none transition focus:border-blue-500" type="number" min="0" max="100" step="any" value={referralUnlockPercent} onChange={(event) => setReferralUnlockPercent(event.target.value)} />
                    </label>
                    <span className="text-sm text-slate-400">%</span>
                    <button type="button" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold transition hover:bg-blue-500 disabled:opacity-50" disabled={busy} onClick={() => void act({ action: "packageReferralUnlockPercent", percent: Number(referralUnlockPercent) })}>حفظ النسبة</button>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold">الحد الأدنى لكل باقة</h3>
                  <span className="text-xs text-slate-500">{plans.length.toLocaleString("ar-EG")} باقة</span>
                </div>
                {plans.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-700 p-5 text-center text-sm text-slate-400">لا توجد باقات لعرض إعداداتها.</div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-700">
                    <div className="hidden grid-cols-[minmax(0,1fr)_160px_100px] items-center gap-3 bg-[#101c2d] px-4 py-3 text-xs font-bold text-slate-400 sm:grid">
                      <span>اسم الباقة</span><span>الحد الأدنى (USDT)</span><span>الإجراء</span>
                    </div>
                    <div className="divide-y divide-slate-800">
                      {plans.map((plan) => (
                        <div key={plan._id} className="grid gap-3 bg-[#0b1422] px-4 py-3 sm:grid-cols-[minmax(0,1fr)_160px_100px] sm:items-center">
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{plan.name}</p>
                            <p className="mt-1 text-xs text-slate-500">الحد الحالي: {money(plan.withdrawalMinimum ?? 100)} USDT</p>
                          </div>
                          <input aria-label={"الحد الأدنى لباقة " + plan.name} className="w-full rounded-lg border border-slate-700 bg-[#050a13] px-3 py-2 text-sm text-white outline-none focus:border-blue-500" type="number" min="0.00000001" step="any" value={minimums[plan._id] ?? String(plan.withdrawalMinimum ?? 100)} onChange={(event) => setMinimums((current) => ({ ...current, [plan._id]: event.target.value }))} />
                          <button type="button" className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm font-bold text-blue-200 transition hover:bg-blue-500/20 disabled:opacity-50" disabled={busy} onClick={() => void act({ action: "minimum", packageId: plan._id, minimum: Number(minimums[plan._id] ?? plan.withdrawalMinimum ?? 100) })}>حفظ الحد</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#08111e]">
          <div className="border-b border-slate-800 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black">طلبات السحب</h3>
                <p className="mt-1 text-xs text-slate-400">افتح تفاصيل أي طلب لمراجعة عنوان الدفع والرسوم ومصدر المبلغ.</p>
              </div>
              <span className="rounded-lg border border-slate-700 bg-[#0b1422] px-3 py-1.5 text-xs text-slate-300">{filteredRequests.length.toLocaleString("ar-EG")} نتيجة</span>
            </div>

            <div className="mt-4 flex flex-col gap-3 xl:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search size={17} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث بالبريد أو الباقة أو عنوان المحفظة أو رقم الطلب..." className="w-full rounded-xl border border-slate-700 bg-[#050a13] py-3 pr-10 pl-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-blue-500" />
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <Filter size={16} className="shrink-0 text-slate-500" />
                {filterOptions.map((option) => (
                  <button key={option.value} type="button" onClick={() => setStatusFilter(option.value)} aria-pressed={statusFilter === option.value} className={"inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition " + (
                    statusFilter === option.value
                      ? "border-blue-400/40 bg-blue-500/15 text-blue-200"
                      : "border-slate-700 bg-[#0b1422] text-slate-400 hover:border-slate-500 hover:text-white"
                  )}>
                    {option.label}
                    <span className={"rounded-md px-1.5 py-0.5 tabular-nums " + (statusFilter === option.value ? "bg-blue-400/15 text-blue-100" : "bg-slate-800 text-slate-400")}>{option.count.toLocaleString("ar-EG")}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filteredRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 text-slate-400"><Search size={21} /></div>
              <h4 className="mt-4 font-bold">{visibleRequests.length === 0 ? "لا توجد طلبات سحب لعرضها" : "لا توجد نتائج مطابقة"}</h4>
              <p className="mt-1 max-w-md text-sm text-slate-500">{visibleRequests.length === 0 ? "ستظهر طلبات المستخدمين هنا عند إرسالها. الطلبات المقبولة تختفي من هذه الصفحة بعد مرور 24 ساعة." : "غيّر فلتر الحالة أو كلمة البحث لعرض طلبات أخرى."}</p>
              {visibleRequests.length > 0 && (query || statusFilter !== "all") && <button type="button" onClick={() => { setQuery(""); setStatusFilter("all"); }} className="mt-4 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-white/[0.04]">مسح الفلاتر</button>}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] border-collapse text-right">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#0b1422] text-xs font-bold text-slate-400">
                    <th className="px-4 py-3.5">المستخدم</th>
                    <th className="px-4 py-3.5">نوع السحب</th>
                    <th className="px-4 py-3.5">الإجمالي</th>
                    <th className="px-4 py-3.5">الصافي</th>
                    <th className="px-4 py-3.5">الحالة</th>
                    <th className="px-4 py-3.5">تاريخ الطلب</th>
                    <th className="px-4 py-3.5">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {pageRequests.map((request) => {
                    const expanded = expandedId === request._id;
                    const pending = request.status === "pending";
                    const allocations = request.allocations || [];
                    return (
                      <Fragment key={request._id}>
                        <tr className={"transition hover:bg-white/[0.02] " + (expanded ? "bg-white/[0.02]" : "")}>
                          <td className="px-4 py-4">
                            <div className="max-w-[210px]">
                              <p className="truncate text-sm font-bold text-slate-100" title={userEmail(request.userId)}>{userEmail(request.userId)}</p>
                              <p className="mt-1 font-mono text-[10px] text-slate-500">#{request._id.slice(-8)}</p>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <p className="text-sm font-semibold text-slate-200">{requestSource(request)}</p>
                            <p className="mt-1 text-xs text-slate-500">{request.network || "الشبكة غير محددة"}</p>
                          </td>
                          <td className="px-4 py-4">
                            <p className="whitespace-nowrap text-sm font-bold tabular-nums">{money(request.grossAmount ?? request.amount)} <span className="text-xs font-normal text-slate-400">USDT</span></p>
                            <p className="mt-1 text-xs text-amber-200">الرسوم: {money(request.feeAmount ?? 0)}</p>
                          </td>
                          <td className="px-4 py-4">
                            <p className="whitespace-nowrap text-sm font-bold tabular-nums text-emerald-300">{money(request.payoutAmount ?? request.amount)}</p>
                            <p className="mt-1 text-xs text-slate-500">USDT</p>
                          </td>
                          <td className="px-4 py-4">
                            <span className={"inline-flex whitespace-nowrap items-center rounded-full border px-2.5 py-1 text-xs font-bold " + statusClass(request.status)}>{statusLabel(request.status)}</span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-xs text-slate-400">{formatDate(request.createdAt)}</td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              {pending && (
                                <>
                                  <button type="button" title="قبول الطلب" aria-label="قبول الطلب" disabled={busy} onClick={() => void act({ action: "approve", id: request._id })} className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-40"><Check size={16} /></button>
                                  <button type="button" title="رفض الطلب" aria-label="رفض الطلب" disabled={busy} onClick={() => void act({ action: "reject", id: request._id })} className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-500/25 bg-rose-500/10 text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-40"><XCircle size={16} /></button>
                                </>
                              )}
                              <button type="button" onClick={() => setExpandedId(expanded ? null : request._id)} aria-expanded={expanded} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-2 text-xs font-bold text-slate-300 transition hover:bg-white/[0.04]">
                                {expanded ? "إخفاء" : "التفاصيل"} {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expanded && (
                          <tr>
                            <td colSpan={7} className="bg-[#050a13]/70 p-4 sm:p-5">
                              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                <div className="rounded-xl border border-slate-800 bg-[#08111e] p-3">
                                  <p className="text-xs text-slate-500">عنوان الدفع</p>
                                  <p className="mt-2 break-all text-sm font-medium text-slate-200">{request.payoutAddress || "غير مسجل"}</p>
                                </div>
                                <div className="rounded-xl border border-slate-800 bg-[#08111e] p-3">
                                  <p className="text-xs text-slate-500">الشبكة والعملة</p>
                                  <p className="mt-2 text-sm font-medium text-slate-200">{request.network || "غير مسجلة"} · {request.asset || "USDT"}</p>
                                </div>
                                <div className="rounded-xl border border-slate-800 bg-[#08111e] p-3">
                                  <p className="text-xs text-slate-500">تفاصيل المبلغ</p>
                                  <p className="mt-2 text-sm text-slate-200">الإجمالي {money(request.grossAmount ?? request.amount)} USDT</p>
                                  <p className="mt-1 text-sm text-amber-200">العمولة {money(request.feeAmount ?? 0)} USDT ({money(request.feePercent ?? 0)}%)</p>
                                  <p className="mt-1 text-sm font-bold text-emerald-300">الصافي {money(request.payoutAmount ?? request.amount)} USDT</p>
                                </div>
                                <div className="rounded-xl border border-slate-800 bg-[#08111e] p-3">
                                  <p className="text-xs text-slate-500">تاريخ الطلب</p>
                                  <p className="mt-2 text-sm text-slate-200">{formatDate(request.createdAt)}</p>
                                  {request.reviewedAt && <p className="mt-1 text-xs text-slate-400">تاريخ المراجعة: {formatDate(request.reviewedAt)}</p>}
                                </div>
                                {request.conversionAsset && (
                                  <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04] p-3 md:col-span-2 xl:col-span-2">
                                    <p className="text-sm font-bold text-cyan-200">تفاصيل تحويل عملة التداول</p>
                                    <p className="mt-2 text-sm text-slate-300">تم بيع {money(request.conversionQuantity ?? 0)} {request.conversionAsset} بسعر متوسط {money(request.conversionPrice ?? 0)} USDT.</p>
                                    <p className="mt-1 text-xs text-slate-400">عمولة التداول: {money(request.tradingFeeAmount ?? 0)} USDT</p>
                                    <p className="mt-1 break-all text-xs text-slate-500">مرجع الأمر: {request.conversionOrderId || "—"}</p>
                                  </div>
                                )}
                                {!request.packageId?.name && request.type !== "general" && allocations.length > 0 && (
                                  <div className="rounded-xl border border-slate-800 bg-[#08111e] p-3 md:col-span-2 xl:col-span-3">
                                    <p className="text-xs font-bold text-slate-400">توزيع المبلغ على الباقات</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {allocations.map((allocation, index) => {
                                        const packageName =
                                          (allocation.packageId && typeof allocation.packageId === "object" ? allocation.packageId.name : undefined) ||
                                          (allocation.userPackageId && typeof allocation.userPackageId === "object" ? allocation.userPackageId.packageName : undefined) ||
                                          "باقة";
                                        return <span key={String(index)} className="rounded-lg border border-slate-700 bg-[#050a13] px-3 py-2 text-xs text-slate-300">{packageName}: <strong className="text-white">{money(allocation.amount)} USDT</strong></span>;
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                              {pending && (
                                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-4">
                                  <button type="button" disabled={busy} onClick={() => void act({ action: "reject", id: request._id })} className="inline-flex items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-2.5 text-sm font-bold text-rose-200 hover:bg-rose-500/20 disabled:opacity-40"><XCircle size={16} /> رفض الطلب</button>
                                  <button type="button" disabled={busy} onClick={() => void act({ action: "approve", id: request._id })} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-40"><Check size={16} /> قبول الطلب</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t border-slate-800 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-400">
                عرض {filteredRequests.length === 0 ? 0 : ((safePage - 1) * pageSize) + 1}–{Math.min(safePage * pageSize, filteredRequests.length)} من {filteredRequests.length.toLocaleString("ar-EG")} نتيجة
                <span className="mr-2 text-slate-600">· كل صفحة {pageSize} طلبات</span>
              </p>
              {pageCount > 1 && (
                <nav aria-label="ترقيم صفحات طلبات السحب" className="flex flex-wrap items-center justify-center gap-1.5">
                  <button
                    type="button"
                    aria-label="الصفحة السابقة"
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    className="flex h-9 items-center gap-1 rounded-lg border border-slate-700 px-2.5 text-xs font-bold text-slate-300 transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <ChevronRight size={15} /> السابق
                  </button>
                  {pageNumbers.map((pageNumber, index) => pageNumber === "ellipsis" ? (
                    <span key={"ellipsis-" + index} className="flex h-9 min-w-8 items-center justify-center text-slate-500">…</span>
                  ) : (
                    <button
                      key={pageNumber}
                      type="button"
                      aria-current={safePage === pageNumber ? "page" : undefined}
                      onClick={() => setCurrentPage(pageNumber)}
                      className={"h-9 min-w-9 rounded-lg border px-3 text-sm font-bold transition " + (
                        safePage === pageNumber
                          ? "border-blue-400/40 bg-blue-500/20 text-blue-200"
                          : "border-slate-700 bg-[#0b1422] text-slate-300 hover:bg-white/[0.05]"
                      )}
                    >
                      {pageNumber.toLocaleString("ar-EG")}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-label="الصفحة التالية"
                    disabled={safePage >= pageCount}
                    onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                    className="flex h-9 items-center gap-1 rounded-lg border border-slate-700 px-2.5 text-xs font-bold text-slate-300 transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    التالي <ChevronLeft size={15} />
                  </button>
                </nav>
              )}
            </div>
            </>
          )}
        </section>
      </div>
    </AdminPageFrame>
  );
}
