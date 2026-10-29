"use client";

import AdminPageFrame from "@/components/AdminPageFrame";
import { Fragment, useCallback, useEffect, useState } from "react";

function date(v: unknown) {
  if (!v) return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("en-US");
}

function money(v: unknown) {
  const n = Number(v || 0);
  return n.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

type AssetTotal = { asset: string; amount: number };
type ReferralPerson = {
  _id: string;
  name: string;
  username: string;
  activeReferralCount: number;
  depositsByAsset: AssetTotal[];
  activeReferralDepositsByAsset: AssetTotal[];
};

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [expandedReferralIds, setExpandedReferralIds] = useState<Record<string, boolean>>({});
  const [referralChildren, setReferralChildren] = useState<Record<string, ReferralPerson[]>>({});
  const [referralLoading, setReferralLoading] = useState<Record<string, boolean>>({});
  const [referralErrors, setReferralErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError("");

    try {
      const params = new URLSearchParams({
        q,
        status,
        sort,
      });

      const res = await fetch(`/api/admin/users?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.message || json?.error || "تعذر تحميل المستخدمين");
      }

      setUsers(json.users || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }, [q, status, sort]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  async function changeStatus(id: string, action: "block" | "unblock") {
    setBusy(id);

    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.message || json?.error || "تعذر تعديل الحالة");
      }

      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "تعذر تعديل الحالة");
    } finally {
      setBusy("");
    }
  }

  async function removeUser(id: string) {
    const ok = window.confirm(
      "هل أنت متأكد من حذف المستخدم نهائيًا؟ هذا الإجراء لا يمكن التراجع عنه."
    );

    if (!ok) return;

    setBusy(id);

    try {
      const res = await fetch(`/api/admin/users?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.message || json?.error || "تعذر حذف المستخدم");
      }

      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "تعذر حذف المستخدم");
    } finally {
      setBusy("");
    }
  }

  async function loadReferralChildren(userId: string) {
    setReferralLoading((current) => ({ ...current, [userId]: true }));
    setReferralErrors((current) => ({ ...current, [userId]: "" }));

    try {
      const response = await fetch(
        `/api/admin/users/referrals?userId=${encodeURIComponent(userId)}`,
        { credentials: "include", cache: "no-store" }
      );
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(result.message || "تعذر تحميل الإحالات النشطة");
      }

      setReferralChildren((current) => ({
        ...current,
        [userId]: Array.isArray(result.referrals) ? result.referrals : [],
      }));
    } catch (e) {
      setReferralErrors((current) => ({
        ...current,
        [userId]: e instanceof Error ? e.message : "تعذر تحميل الإحالات النشطة",
      }));
    } finally {
      setReferralLoading((current) => ({ ...current, [userId]: false }));
    }
  }

  function toggleReferrals(userId: string) {
    const willOpen = !expandedReferralIds[userId];
    setExpandedReferralIds((current) => ({ ...current, [userId]: willOpen }));

    if (willOpen && !Object.prototype.hasOwnProperty.call(referralChildren, userId)) {
      void loadReferralChildren(userId);
    }
  }

  function renderAssetTotals(rows: AssetTotal[] | undefined, color = "text-slate-200") {
    if (!Array.isArray(rows) || rows.length === 0) {
      return <span className="text-slate-600">—</span>;
    }

    return (
      <div className={`space-y-1 ${color}`}>
        {rows.map((row) => (
          <div key={row.asset} className="whitespace-nowrap">
            {money(row.amount)} {row.asset}
          </div>
        ))}
      </div>
    );
  }

  function renderReferralTree(parentId: string, depth = 0): React.ReactNode {
    if (referralLoading[parentId]) {
      return <div className="py-4 text-sm text-slate-500">جاري تحميل الإحالات...</div>;
    }

    if (referralErrors[parentId]) {
      return (
        <div className="flex flex-wrap items-center gap-3 py-3 text-sm text-red-300">
          <span>{referralErrors[parentId]}</span>
          <button
            type="button"
            onClick={() => void loadReferralChildren(parentId)}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-300"
          >
            إعادة المحاولة
          </button>
        </div>
      );
    }

    const children = referralChildren[parentId] || [];
    if (children.length === 0) {
      return <div className="py-4 text-sm text-slate-500">لا توجد إحالات نشطة لهذا المستخدم.</div>;
    }

    return (
      <div className={depth > 0 ? "mr-3 space-y-3 border-r border-slate-700 pr-3" : "space-y-3"}>
        {children.map((person) => (
          <div key={person._id} className="rounded-xl border border-slate-700/80 bg-[#050a13] p-3">
            <div className="grid items-center gap-3 lg:grid-cols-[minmax(180px,1fr)_minmax(160px,1fr)_auto]">
              <div>
                <div className="font-bold text-slate-100">{person.name || "بدون اسم"}</div>
                <div className="mt-1 text-xs text-slate-500">@{person.username || "—"}</div>
              </div>

              <div>
                <div className="mb-1 text-[11px] text-slate-500">الإيداعات المعتمدة التي جلبها</div>
                {renderAssetTotals(person.depositsByAsset, "text-emerald-300")}
              </div>

              <button
                type="button"
                disabled={person.activeReferralCount === 0}
                onClick={() => void toggleReferrals(person._id)}
                className="flex items-center justify-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs font-bold text-cyan-200 disabled:cursor-default disabled:opacity-50"
              >
                إحالات نشطة: {person.activeReferralCount}
                {person.activeReferralCount > 0 ? (
                  <span>{expandedReferralIds[person._id] ? "−" : "+"}</span>
                ) : null}
              </button>
            </div>

            {expandedReferralIds[person._id] ? (
              <div className="mt-3 border-t border-slate-800 pt-3">
                {renderReferralTree(person._id, depth + 1)}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  return (
    <AdminPageFrame title="المستخدمون">
      <div dir="rtl" className="space-y-5">
        <div className="grid gap-3 lg:grid-cols-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث بالاسم أو المستخدم أو البريد..."
            className="rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 text-sm outline-none"
          />

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 text-sm outline-none"
          >
            <option value="all">كل المستخدمين</option>
            <option value="active">النشطون</option>
            <option value="blocked">المحظورون</option>
          </select>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 text-sm outline-none"
          >
            <option value="newest">الأحدث أولًا</option>
            <option value="oldest">الأقدم أولًا</option>
          </select>

          <button
            onClick={() => void load()}
            className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold"
          >
            تحديث
          </button>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-300">
            {error}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#08111e]">
          {loading ? (
            <div className="p-12 text-center text-slate-500">
              جاري تحميل المستخدمين...
            </div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              لا يوجد مستخدمون مطابقون للفلتر.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-right text-sm">
                <thead className="border-b border-slate-800 bg-[#0c1726]">
                  <tr>
                    <th className="px-4 py-4">ArabTrade ID</th>
                    <th className="px-4 py-4">المستخدم</th>
                    <th className="px-4 py-4">البريد</th>
                    <th className="px-4 py-4">الحالة</th>
                    <th className="px-4 py-4">رصيد الإيداع الخارجي</th>
                    <th className="px-4 py-4">عدد السحوبات</th>
                    <th className="px-4 py-4">إجمالي المبلغ المسحوب</th>
                    <th className="px-4 py-4">الإحالات النشطة</th>
                    <th className="px-4 py-4">إجمالي ما جلبته الإحالات</th>
                    <th className="px-4 py-4">تاريخ التسجيل</th>
                    <th className="px-4 py-4">الإجراءات</th>
                  </tr>
                </thead>

                <tbody>
                  {users.map((user) => (
                    <Fragment key={user._id}>
                    <tr
                      className="border-b border-slate-800/70 last:border-0"
                    >
                      <td className="px-4 py-4 font-black text-blue-400">
                        {user.arabTradeId || "—"}
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-bold">
                          {user.name || "بدون اسم"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          @{user.username}
                        </div>
                      </td>

                      <td className="px-4 py-4 text-slate-300">
                        {user.email}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            user.isActive
                              ? "bg-emerald-500/10 text-emerald-300"
                              : "bg-red-500/10 text-red-300"
                          }`}
                        >
                          {user.isActive ? "نشط" : "محظور"}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-sky-200">
                        {Array.isArray(user.depositBalances) && user.depositBalances.length ? user.depositBalances.map((b: any) => <div key={b.asset} className="whitespace-nowrap">{Number(b.available || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })} {b.asset}</div>) : "—"}
                      </td>

                      <td className="px-4 py-4 text-slate-200">
                        {money(user.withdrawalCount)}
                      </td>

                      <td className="px-4 py-4 font-bold text-amber-200">
                        {money(user.withdrawnAmount)} USDT
                      </td>

                      <td className="px-4 py-4">
                        <button
                          type="button"
                          disabled={Number(user.activeReferralCount || 0) === 0}
                          onClick={() => void toggleReferrals(String(user._id))}
                          className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs font-black text-cyan-200 disabled:cursor-default disabled:opacity-50"
                        >
                          {money(user.activeReferralCount)} {expandedReferralIds[String(user._id)] ? "−" : "+"}
                        </button>
                      </td>

                      <td className="px-4 py-4 text-emerald-300">
                        {renderAssetTotals(user.activeReferralDepositsByAsset, "text-emerald-300")}
                      </td>

                      <td className="px-4 py-4 text-slate-400">
                        {date(user.createdAt)}
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            disabled={busy === user._id}
                            onClick={() =>
                              void changeStatus(
                                user._id,
                                user.isActive ? "block" : "unblock"
                              )
                            }
                            className={`rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50 ${
                              user.isActive
                                ? "bg-amber-600"
                                : "bg-emerald-600"
                            }`}
                          >
                            {user.isActive ? "حظر" : "فك الحظر"}
                          </button>

                          <button
                            disabled={busy === user._id}
                            onClick={() => void removeUser(user._id)}
                            className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold disabled:opacity-50"
                          >
                            حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedReferralIds[String(user._id)] ? (
                      <tr className="border-b border-slate-800/70 bg-[#07101b]">
                        <td colSpan={11} className="px-4 py-4">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div className="font-black text-cyan-200">
                              الإحالات النشطة للمستخدم: {user.name || user.username}
                            </div>
                            <div className="text-xs text-slate-500">
                              الرصيد محسوب من الإيداعات الخارجية المعتمدة، كل عملة منفصلة.
                            </div>
                          </div>
                          {renderReferralTree(String(user._id))}
                        </td>
                      </tr>
                    ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminPageFrame>
  );
}