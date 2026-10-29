"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Gift,
  RefreshCw,
  Wallet,
  Clock3,
  CheckCircle2,
  CircleDollarSign,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Reward = {
  _id?: string;
  title?: string;
  type?: "bonus" | "cashback" | "commission" | "mission" | string;
  amount?: number;
  asset?: string;
  status?: "pending" | "available" | "claimed" | "expired" | string;
  expiresAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
};

type RewardsResponse = {
  success?: boolean;
  rewardsEnabled?: boolean;
  rewards?: Reward[];
  message?: string;
};

function number(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatNumber(
  value: unknown,
  digits = 8
) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(n);
}

function formatDate(value: unknown) {
  if (!value) return "—";

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function rewardTypeLabel(value: unknown) {
  switch (String(value || "").toLowerCase()) {
    case "bonus":
      return "مكافأة";
    case "cashback":
      return "استرداد نقدي";
    case "commission":
      return "عمولة";
    case "mission":
      return "مهمة";
    default:
      return value ? String(value) : "—";
  }
}

function statusLabel(value: unknown) {
  switch (String(value || "").toLowerCase()) {
    case "available":
      return "متاحة";
    case "pending":
      return "معلقة";
    case "claimed":
      return "تم الاستلام";
    case "expired":
      return "منتهية";
    default:
      return value ? String(value) : "—";
  }
}

function statusClass(value: unknown) {
  switch (String(value || "").toLowerCase()) {
    case "available":
      return "bg-emerald-500/10 text-emerald-300";
    case "pending":
      return "bg-amber-500/10 text-amber-300";
    case "claimed":
      return "bg-blue-500/10 text-cyan-300";
    case "expired":
      return "bg-white/5 text-slate-500";
    default:
      return "bg-white/5 text-slate-400";
  }
}

export default function EarnPage() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claimingId, setClaimingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadRewards = useCallback(
    async (silent = false) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const response = await fetch(
          "/api/rewards",
          {
            credentials: "include",
            cache: "no-store",
          }
        );

        const json =
          (await response.json().catch(() => ({}))) as RewardsResponse;

        if (!response.ok || !json.success) {
          throw new Error(
            json.message ||
              "تعذر تحميل المكافآت."
          );
        }

        setEnabled(
          json.rewardsEnabled !== false
        );

        setRewards(
          Array.isArray(json.rewards)
            ? json.rewards
            : []
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "تعذر تحميل المكافآت."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadRewards();

    const timer =
      window.setInterval(() => {
        void loadRewards(true);
      }, 10000);

    return () =>
      window.clearInterval(timer);
  }, [loadRewards]);

  async function claimReward(
    reward: Reward
  ) {
    const id = String(
      reward._id || ""
    );

    if (!id) return;

    try {
      setClaimingId(id);
      setError("");
      setMessage("");

      const response = await fetch(
        "/api/rewards",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            rewardId: id,
          }),
        }
      );

      const json =
        await response.json().catch(() => ({}));

      if (!response.ok || !json.success) {
        throw new Error(
          json.message ||
            json.error ||
            "تعذر استلام المكافأة."
        );
      }

      setMessage(
        `تم استلام ${formatNumber(
          json.reward?.amount,
          8
        )} ${String(
          json.reward?.asset || reward.asset || ""
        ).toUpperCase()} بنجاح.`
      );

      await loadRewards(true);
    } catch (claimError) {
      setError(
        claimError instanceof Error
          ? claimError.message
          : "تعذر استلام المكافأة."
      );
    } finally {
      setClaimingId("");
    }
  }

  const availableRewards = useMemo(
    () =>
      rewards.filter(
        (reward) =>
          String(reward.status || "")
            .toLowerCase() === "available"
      ),
    [rewards]
  );

  const totalRewards = useMemo(
    () =>
      availableRewards.reduce(
        (sum, reward) =>
          sum + number(reward.amount),
        0
      ),
    [availableRewards]
  );

  const assetsCount = useMemo(
    () =>
      new Set(
        availableRewards
          .map((reward) =>
            String(
              reward.asset || ""
            ).toUpperCase()
          )
          .filter(Boolean)
      ).size,
    [availableRewards]
  );

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#050a13] text-white"
    >
      <div className="mx-auto max-w-[1500px] px-4 py-6 md:px-6 lg:px-8">

        <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] font-bold tracking-[0.22em] text-cyan-400">
              ARABTRADE EARN
            </div>

            <h1 className="mt-2 text-3xl font-black">
              الكسب والمكافآت
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500">
              إدارة المكافآت المتاحة لحسابك واستلامها مباشرة في محفظة التمويل.
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/dashboard/rewards"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs font-semibold text-slate-300 hover:bg-white/5"
            >
              مركز المكافآت
              <ArrowLeft size={14} />
            </Link>

            <button
              type="button"
              onClick={() =>
                void loadRewards(true)
              }
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-50"
            >
              <RefreshCw
                size={14}
                className={
                  refreshing
                    ? "animate-spin"
                    : ""
                }
              />
              تحديث
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.05] px-5 py-4 text-xs text-red-300">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
            >
              <X size={15} />
            </button>
          </div>
        ) : null}

        {message ? (
          <div className="mb-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] px-5 py-4 text-xs text-emerald-300">
            {message}
          </div>
        ) : null}

        {!enabled ? (
          <section className="mb-6 rounded-3xl border border-white/10 bg-[#07101d] p-8 text-center">
            <Gift
              size={28}
              className="mx-auto text-slate-600"
            />

            <h2 className="mt-4 text-lg font-bold">
              نظام المكافآت متوقف حاليًا
            </h2>

            <p className="mt-2 text-xs text-slate-600">
              ستظهر المكافآت عند إتاحتها.
            </p>
          </section>
        ) : (
          <>
            <div className="mb-6 grid gap-4 md:grid-cols-3">

              <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
                <Gift
                  size={19}
                  className="text-cyan-300"
                />
                <div className="mt-4 text-[10px] text-slate-600">
                  المكافآت المتاحة
                </div>
                <div className="mt-3 font-mono text-2xl font-bold text-white">
                  {availableRewards.length}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
                <CircleDollarSign
                  size={19}
                  className="text-cyan-300"
                />
                <div className="mt-4 text-[10px] text-slate-600">
                  إجمالي القيمة
                </div>
                <div className="mt-3 font-mono text-2xl font-bold text-white">
                  {formatNumber(
                    totalRewards,
                    8
                  )}
                </div>
                <div className="mt-1 text-[9px] text-slate-700">
                  مجموع المكافآت المتاحة
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
                <Wallet
                  size={19}
                  className="text-cyan-300"
                />
                <div className="mt-4 text-[10px] text-slate-600">
                  الأصول
                </div>
                <div className="mt-3 font-mono text-2xl font-bold text-white">
                  {assetsCount}
                </div>
                <div className="mt-1 text-[9px] text-slate-700">
                  أصول موجودة ضمن المكافآت المتاحة
                </div>
              </div>
            </div>

            <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#07101d]">

              <div className="flex flex-col gap-3 border-b border-white/10 p-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-bold">
                    المكافآت المتاحة
                  </h2>
                  <p className="mt-1 text-[10px] text-slate-600">
                    البيانات المعروضة تأتي مباشرة من نظام المكافآت.
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#050a13] px-3 py-2 text-[10px] text-slate-500">
                  {availableRewards.length} مكافأة
                </div>
              </div>

              {loading ? (
                <div className="flex min-h-[300px] items-center justify-center">
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <RefreshCw
                      size={16}
                      className="animate-spin"
                    />
                    جاري تحميل المكافآت...
                  </div>
                </div>
              ) : availableRewards.length === 0 ? (
                <div className="px-6 py-20 text-center">
                  <Gift
                    size={28}
                    className="mx-auto text-slate-600"
                  />

                  <h3 className="mt-4 text-sm font-bold text-slate-300">
                    لا توجد مكافآت متاحة
                  </h3>

                  <p className="mx-auto mt-2 max-w-lg text-[10px] leading-6 text-slate-600">
                    ستظهر هنا المكافآت التي يمنحها النظام لحسابك عند توفرها.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[1050px] w-full text-right">
                    <thead className="border-b border-white/10 bg-white/[0.015]">
                      <tr className="text-[10px] text-slate-600">
                        <th className="px-5 py-4">
                          المكافأة
                        </th>
                        <th className="px-5 py-4">
                          النوع
                        </th>
                        <th className="px-5 py-4">
                          المبلغ
                        </th>
                        <th className="px-5 py-4">
                          الأصل
                        </th>
                        <th className="px-5 py-4">
                          الحالة
                        </th>
                        <th className="px-5 py-4">
                          انتهاء الصلاحية
                        </th>
                        <th className="px-5 py-4">
                          تاريخ الإنشاء
                        </th>
                        <th className="px-5 py-4">
                          إجراء
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {availableRewards.map(
                        (reward) => {
                          const id =
                            String(
                              reward._id || ""
                            );

                          const available =
                            String(
                              reward.status || ""
                            ).toLowerCase() ===
                            "available";

                          return (
                            <tr
                              key={id}
                              className="border-b border-white/[0.05] transition hover:bg-white/[0.02]"
                            >
                              <td className="px-5 py-4">
                                <div className="font-semibold text-white">
                                  {reward.title ||
                                    "مكافأة"}
                                </div>
                              </td>

                              <td className="px-5 py-4 text-xs text-slate-400">
                                {rewardTypeLabel(
                                  reward.type
                                )}
                              </td>

                              <td className="px-5 py-4 font-mono text-xs font-semibold text-cyan-300">
                                {formatNumber(
                                  reward.amount,
                                  8
                                )}
                              </td>

                              <td className="px-5 py-4 font-mono text-xs text-slate-300">
                                {String(
                                  reward.asset ||
                                    "—"
                                ).toUpperCase()}
                              </td>

                              <td className="px-5 py-4">
                                <span
                                  className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold ${statusClass(
                                    reward.status
                                  )}`}
                                >
                                  {statusLabel(
                                    reward.status
                                  )}
                                </span>
                              </td>

                              <td className="px-5 py-4 text-[10px] text-slate-500">
                                {reward.expiresAt
                                  ? formatDate(
                                      reward.expiresAt
                                    )
                                  : "بدون انتهاء"}
                              </td>

                              <td className="px-5 py-4 text-[10px] text-slate-500">
                                {formatDate(
                                  reward.createdAt
                                )}
                              </td>

                              <td className="px-5 py-4">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void claimReward(
                                      reward
                                    )
                                  }
                                  disabled={
                                    !available ||
                                    claimingId === id
                                  }
                                  className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-[10px] font-bold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {claimingId ===
                                  id ? (
                                    <>
                                      <RefreshCw
                                        size={12}
                                        className="animate-spin"
                                      />
                                      جارٍ الاستلام...
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2
                                        size={12}
                                      />
                                      استلام
                                    </>
                                  )}
                                </button>
                              </td>
                            </tr>
                          );
                        }
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="mt-5 rounded-2xl border border-white/10 bg-[#07101d] p-5">
              <div className="flex items-center gap-3">
                <Clock3
                  size={17}
                  className="text-cyan-300"
                />

                <div>
                  <h2 className="text-sm font-bold">
                    ملاحظات
                  </h2>

                  <p className="mt-1 text-[10px] leading-5 text-slate-600">
                    المكافأة عند استلامها تُضاف إلى محفظة التمويل وفق النظام الحالي.
                    لا يتم عرض عوائد أو منتجات ادخار غير موجودة في الـBackend.
                  </p>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}