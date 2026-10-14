"use client";

import { useEffect, useState } from "react";
import AdminPageFrame from "@/components/AdminPageFrame";

type User = {
  _id: string;
  name: string;
  username: string;
  email: string;
  arabTradeId?: number;
};

type RewardBox = {
  _id: string;
  title: string;
  type: string;
  amount: number;
  asset: string;
  status: string;
  expiresAt?: string | null;
  createdAt?: string;
  metadata?: {
    campaignId?: string;
    mode?: "fixed" | "random";
    minAmount?: number;
    maxAmount?: number;
    durationHours?: number;
    target?: "user" | "all";
  };
  userId?: {
    name?: string;
    username?: string;
    email?: string;
    arabTradeId?: number;
  };
};

export default function RewardsAdminPage() {
  const [enabled, setEnabled] = useState(true);

  const [target, setTarget] = useState<"user" | "all">("user");
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const [amountMode, setAmountMode] = useState<"fixed" | "random">("fixed");
  const [fixedAmount, setFixedAmount] = useState("1");
  const [minAmount, setMinAmount] = useState("1");
  const [maxAmount, setMaxAmount] = useState("3");

  const [title, setTitle] = useState("مكافأة");
  const asset = "USDT";
  const [durationHours, setDurationHours] = useState("12");

  const [boxes, setBoxes] = useState<RewardBox[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const res = await fetch("/api/admin/rewards", {
        credentials: "include",
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.message || "تعذر تحميل المكافآت"
        );
      }

      setEnabled(data.rewardsEnabled !== false);
      setBoxes(
        Array.isArray(data.rewards)
          ? data.rewards
          : []
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "تعذر تحميل المكافآت"
      );
    } finally {
      setLoading(false);
    }
  }

  async function searchUsers(value: string) {
    setSearch(value);
    setSelectedUser(null);

    if (!value.trim()) {
      setUsers([]);
      return;
    }

    setSearching(true);

    try {
      const res = await fetch(
        `/api/admin/users?q=${encodeURIComponent(
          value.trim()
        )}`,
        {
          credentials: "include",
          cache: "no-store",
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        setUsers([]);
        return;
      }

      setUsers(
        Array.isArray(data.users)
          ? data.users.slice(0, 20)
          : []
      );
    } catch {
      setUsers([]);
    } finally {
      setSearching(false);
    }
  }

  async function saveEnabled() {
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/rewards", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.message || "تعذر حفظ حالة المكافآت"
        );
      }

      setEnabled(data.rewardsEnabled !== false);
      setMessage("تم حفظ حالة نظام المكافآت");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "تعذر حفظ الحالة"
      );
    } finally {
      setSaving(false);
    }
  }

  async function createRewardBox() {
    setMessage("");

    if (target === "user" && !selectedUser) {
      setMessage("اختر المستخدم أولًا");
      return;
    }

    const hours = Number(durationHours);

    if (!Number.isFinite(hours) || hours <= 0) {
      setMessage("المدة يجب أن تكون أكبر من صفر");
      return;
    }

    let fixed = 0;
    let min = 0;
    let max = 0;

    if (amountMode === "fixed") {
      fixed = Number(fixedAmount);

      if (!Number.isFinite(fixed) || fixed <= 0) {
        setMessage("أدخل مبلغًا صحيحًا");
        return;
      }
    } else {
      min = Number(minAmount);
      max = Number(maxAmount);

      if (
        !Number.isFinite(min) ||
        !Number.isFinite(max) ||
        min <= 0 ||
        max < min
      ) {
        setMessage("أدخل نطاقًا صحيحًا للمبلغ");
        return;
      }
    }

    setSaving(true);

    try {
      const res = await fetch("/api/admin/rewards", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          target,
          userId:
            target === "user"
              ? selectedUser?._id
              : undefined,
          title: title.trim() || "مكافأة",
          asset: asset.trim().toUpperCase(),
          amountMode,
          fixedAmount: fixed,
          minAmount: min,
          maxAmount: max,
          durationHours: hours,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.message || "تعذر إنشاء صندوق المكافأة"
        );
      }

      setMessage(
        data.message ||
          `تم إنشاء ${data.count || 0} مكافأة`
      );

      setBoxes(
        Array.isArray(data.rewards)
          ? [...data.rewards, ...boxes]
          : boxes
      );

      setSearch("");
      setUsers([]);
      setSelectedUser(null);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "تعذر إنشاء صندوق المكافأة"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPageFrame title="المكافآت">
      <div
        dir="rtl"
        className="mx-auto w-full max-w-6xl space-y-6"
      >
        <section className="rounded-2xl border border-slate-800 bg-[#08111e] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black">
                نظام المكافآت
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                إدارة صناديق المكافآت والتحكم في وصولها للمستخدمين.
              </p>
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={() => setEnabled((value) => !value)}
              className={`relative h-7 w-12 rounded-full transition ${
                enabled
                  ? "bg-emerald-500"
                  : "bg-slate-700"
              }`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                  enabled ? "right-1" : "right-6"
                }`}
              />
            </button>
          </div>

          <div className="mt-3 text-sm font-bold">
            {enabled ? (
              <span className="text-emerald-300">
                النظام مفعّل
              </span>
            ) : (
              <span className="text-red-300">
                النظام متوقف
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={() => void saveEnabled()}
            className="mt-4 rounded-xl bg-blue-600 px-5 py-3 font-black disabled:opacity-50"
          >
            حفظ الحالة
          </button>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-[#08111e] p-6">
          <h2 className="text-xl font-black">
            إنشاء صندوق مكافأة
          </h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold">
                إرسال إلى
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTarget("user");
                    setSelectedUser(null);
                    setSearch("");
                    setUsers([]);
                  }}
                  className={`rounded-xl px-4 py-3 font-black ${
                    target === "user"
                      ? "bg-blue-600"
                      : "bg-[#0b1422] text-slate-400"
                  }`}
                >
                  مستخدم محدد
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTarget("all");
                    setSelectedUser(null);
                    setSearch("");
                    setUsers([]);
                  }}
                  className={`rounded-xl px-4 py-3 font-black ${
                    target === "all"
                      ? "bg-blue-600"
                      : "bg-[#0b1422] text-slate-400"
                  }`}
                >
                  جميع المستخدمين
                </button>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold">
                عنوان الصندوق
              </label>

              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none"
              />
            </div>
          </div>

          {target === "user" ? (
            <div className="relative mt-5">
              <label className="mb-2 block text-sm font-bold">
                اختيار المستخدم
              </label>

              <input
                value={search}
                onChange={(e) => {
                  void searchUsers(e.target.value);
                }}
                placeholder="ابحث بالبريد أو اسم المستخدم أو ArabTrade ID"
                className="w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none"
              />

              {search.trim() && !selectedUser ? (
                <div className="absolute right-0 left-0 top-full z-50 mt-2 max-h-72 overflow-y-auto rounded-xl border border-slate-700 bg-[#0b1422] shadow-2xl">
                  {searching ? (
                    <div className="p-4 text-center text-sm text-slate-500">
                      جاري البحث...
                    </div>
                  ) : users.length === 0 ? (
                    <div className="p-4 text-center text-sm text-slate-500">
                      لا توجد نتائج
                    </div>
                  ) : (
                    users.map((user) => (
                      <button
                        key={user._id}
                        type="button"
                        onClick={() => {
                          setSelectedUser(user);
                          setSearch(
                            user.email ||
                              user.username ||
                              String(user.arabTradeId || "")
                          );
                          setUsers([]);
                        }}
                        className="block w-full border-b border-slate-800 px-4 py-3 text-right hover:bg-white/[0.03]"
                      >
                        <div className="font-bold">
                          {user.name}
                        </div>

                        <div className="mt-1 text-xs text-slate-400">
                          {user.email}
                        </div>

                        <div className="mt-1 text-xs text-cyan-400">
                          ID: {user.arabTradeId ?? "—"}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              ) : null}

              {selectedUser ? (
                <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  المستخدم:
                  <b className="mr-1">
                    {selectedUser.name}
                  </b>
                  <span className="mr-2 text-xs text-slate-400">
                    {selectedUser.email}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5">
            <label className="mb-2 block text-sm font-bold">
              طريقة المبلغ
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAmountMode("fixed")}
                className={`rounded-xl px-4 py-3 font-black ${
                  amountMode === "fixed"
                    ? "bg-blue-600"
                    : "bg-[#0b1422] text-slate-400"
                }`}
              >
                مبلغ ثابت
              </button>

              <button
                type="button"
                onClick={() => setAmountMode("random")}
                className={`rounded-xl px-4 py-3 font-black ${
                  amountMode === "random"
                    ? "bg-blue-600"
                    : "bg-[#0b1422] text-slate-400"
                }`}
              >
                عشوائي
              </button>
            </div>
          </div>

          {amountMode === "fixed" ? (
            <div className="mt-5">
              <label className="mb-2 block text-sm font-bold">
                قيمة المكافأة
              </label>

              <input
                type="number"
                min="0.01"
                step="0.01"
                value={fixedAmount}
                onChange={(e) =>
                  setFixedAmount(e.target.value)
                }
                className="w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none"
              />
            </div>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-bold">
                  من
                </label>

                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={minAmount}
                  onChange={(e) =>
                    setMinAmount(e.target.value)
                  }
                  className="w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold">
                  إلى
                </label>

                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={maxAmount}
                  onChange={(e) =>
                    setMaxAmount(e.target.value)
                  }
                  className="w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none"
                />
              </div>
            </div>
          )}

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold">
                العملة
              </label>

              <input
                value={asset}
                readOnly
                aria-label="عملة مكافأة الصندوق"
                className="w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 uppercase outline-none opacity-80"
              />
              <p className="mt-1 text-xs text-slate-500">تُضاف المكافأة إلى رصيد سحب الباقة النشطة بعملة USDT فقط.</p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold">
                مدة الصندوق بالساعات
              </label>

              <input
                type="number"
                min="1"
                step="1"
                value={durationHours}
                onChange={(e) =>
                  setDurationHours(e.target.value)
                }
                placeholder="12"
                className="w-full rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-3 outline-none"
              />
            </div>
          </div>

          {message ? (
            <div className="mt-5 rounded-xl border border-slate-700 bg-[#0b1422] p-4 text-sm text-slate-300">
              {message}
            </div>
          ) : null}

          <button
            type="button"
            disabled={saving || !enabled}
            onClick={() => void createRewardBox()}
            className="mt-5 w-full rounded-xl bg-blue-600 px-5 py-4 font-black disabled:opacity-40"
          >
            {!enabled
              ? "نظام المكافآت متوقف"
              : saving
                ? "جاري إنشاء الصندوق..."
                : "إنشاء صندوق المكافأة"}
          </button>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-black">
              صناديق المكافآت
            </h2>

            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl border border-slate-700 bg-[#0b1422] px-4 py-2 text-sm"
            >
              تحديث
            </button>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-10 text-center text-slate-500">
              جاري تحميل الصناديق...
            </div>
          ) : boxes.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-[#08111e] p-10 text-center text-slate-500">
              لا توجد مكافآت منشأة.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {boxes.map((box) => (
                <div
                  key={box._id}
                  className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-[#08111e] p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-slate-500">
                        صندوق مكافأة
                      </div>

                      <h3 className="mt-1 font-black">
                        {box.title}
                      </h3>
                    </div>

                    <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] text-emerald-300">
                      {box.status}
                    </span>
                  </div>

                  <div className="mt-5 text-3xl font-black">
                    {box.amount} {box.asset}
                  </div>

                  <div className="mt-3 text-xs text-slate-500">
                    {box.metadata?.mode === "random"
                      ? `عشوائي: ${box.metadata.minAmount} — ${box.metadata.maxAmount} ${box.asset}`
                      : "مبلغ ثابت"}
                  </div>

                  {box.userId ? (
                    <div className="mt-4 rounded-xl bg-black/20 p-3 text-xs">
                      <div className="font-bold">
                        {box.userId.name || "—"}
                      </div>

                      <div className="mt-1 text-slate-500">
                        {box.userId.email || "—"}
                      </div>

                      <div className="mt-1 text-cyan-400">
                        ID: {box.userId.arabTradeId ?? "—"}
                      </div>
                    </div>
                  ) : null}

                  {box.expiresAt ? (
                    <div className="mt-4 text-xs text-slate-500">
                      ينتهي:
                      <span className="mr-1 text-slate-300">
                        {new Date(
                          box.expiresAt
                        ).toLocaleString("ar-EG")}
                      </span>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminPageFrame>
  );
}