"use client";

import AdminPageFrame from "@/components/AdminPageFrame";
import { useCallback, useEffect, useState } from "react";

function date(v: unknown) {
  if (!v) return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("en-US");
}

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
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
                    <th className="px-4 py-4">الصلاحية</th>
                    <th className="px-4 py-4">الحالة</th>
                    <th className="px-4 py-4">التوثيق</th>
                    <th className="px-4 py-4">رصيد الإيداع الخارجي</th>
                    <th className="px-4 py-4">رصيد السحب الداخلي</th>
                    <th className="px-4 py-4">تاريخ التسجيل</th>
                    <th className="px-4 py-4">الإجراءات</th>
                  </tr>
                </thead>

                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user._id}
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

                      <td className="px-4 py-4 text-slate-300">
                        {user.role}
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

                      <td className="px-4 py-4 text-slate-300">
                        {user.isVerified ? "موثق" : "غير موثق"}
                      </td>

                      <td className="px-4 py-4 text-sky-200">
                        {Array.isArray(user.depositBalances) && user.depositBalances.length ? user.depositBalances.map((b: any) => <div key={b.asset} className="whitespace-nowrap">{Number(b.available || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })} {b.asset}</div>) : "—"}
                      </td>

                      <td className="px-4 py-4 text-emerald-200">
                        {Array.isArray(user.withdrawalBalances) && user.withdrawalBalances.length ? user.withdrawalBalances.map((b: any) => <div key={b.asset} className="whitespace-nowrap">{Number(b.available || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })} {b.asset}</div>) : "—"}
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