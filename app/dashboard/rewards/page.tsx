"use client";

import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";
import { useEffect, useState } from "react";

type Reward = {
  _id: string;
  title: string;
  type: "bonus" | "cashback" | "commission" | "mission";
  amount: number;
  asset: string;
  status: "pending" | "available" | "claimed" | "expired";
  expiresAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  metadata?: {
    amountMode?: "fixed" | "random";
    minAmount?: number;
    maxAmount?: number;
    campaignId?: string;
    durationHours?: number;
    target?: string;
  };
};

function getRemaining(expiresAt?: string | null) {
  if (!expiresAt) return 0;

  return Math.max(
    0,
    new Date(expiresAt).getTime() - Date.now()
  );
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days} يوم ${String(hours).padStart(2, "0")}:${String(
      minutes
    ).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}:${String(seconds).padStart(2, "0")}`;
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 8,
  }).format(value);
}

function formatDate(value?: string) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function RewardsPage() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [claimedRewards, setClaimedRewards] = useState<Reward[]>([]);
  const [claimedCount, setClaimedCount] = useState(0);
  const [claimedByAsset, setClaimedByAsset] = useState<Record<string, number>>({});
  const [totalClaimed, setTotalClaimed] = useState(0);
  const [remaining, setRemaining] = useState<Record<string, number>>({});

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function loadRewards() {
    const res = await fetch("/api/rewards", {
      credentials: "include",
      cache: "no-store",
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(
        data.message || "تعذر تحميل المكافآت"
      );
    }

    const list = Array.isArray(data.rewards)
      ? data.rewards
      : [];

    setRewards(list);
    setClaimedRewards(
      Array.isArray(data.claimedRewards) ? data.claimedRewards : []
    );
    setClaimedCount(Number(data.claimedCount || 0));
    setClaimedByAsset(
      data.claimedByAsset && typeof data.claimedByAsset === "object"
        ? data.claimedByAsset
        : {}
    );
    setTotalClaimed(Number(data.totalClaimed || 0));

    const timers: Record<string, number> = {};

    for (const reward of list) {
      timers[reward._id] = getRemaining(
        reward.expiresAt
      );
    }

    setRemaining(timers);
  }

  async function load() {
    setLoading(true);
    setError("");

    try {
      await loadRewards();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "تعذر تحميل بيانات المكافآت"
      );
    } finally {
      setLoading(false);
    }
  }

  async function claim(id: string) {
    if (busy) return;

    setBusy(id);
    setError("");

    try {
      const res = await fetch("/api/rewards", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rewardId: id,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.message || "تعذر استلام المكافأة"
        );
      }

      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "حدث خطأ أثناء استلام المكافأة"
      );
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemaining(() => {
        const next: Record<string, number> = {};

        for (const reward of rewards) {
          next[reward._id] = getRemaining(
            reward.expiresAt
          );
        }

        return next;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [rewards]);


  return (
    <>
      <InternalNavbar />

      <div className="mx-auto flex max-w-[1700px]">
        <InternalSidebar />

        <main
          dir="rtl"
          className="min-w-0 flex-1 bg-[#050a13] text-white"
        >
          <div className="mx-auto w-full max-w-7xl p-4 md:p-6 lg:p-8">

            <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <div className="text-[10px] font-bold tracking-widest text-cyan-400">
                  REWARDS
                </div>

                <h1 className="mt-2 text-2xl font-black md:text-3xl">
                  مركز المكافآت
                </h1>

                <p className="mt-2 text-sm text-slate-500">
                  استلم المكافآت التي يمنحها لك النظام قبل انتهاء صلاحيتها.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="rounded-xl border border-white/10 bg-[#07101d] px-4 py-2.5 text-sm font-bold text-slate-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                تحديث البيانات
              </button>
            </div>

            {error ? (
              <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
                {error}
              </div>
            ) : null}

            <div className="mb-7 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
                <div className="text-xs text-slate-500">
                  المكافآت المتاحة
                </div>

                <div className="mt-3 text-2xl font-black">
                  {loading ? "—" : rewards.length}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
                <div className="text-xs text-slate-500">
                  عدد المكافآت المستلمة
                </div>

                <div className="mt-3 text-2xl font-black">
                  {loading ? "—" : claimedCount}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
                <div className="text-xs text-slate-500">
                  إجمالي المكافآت المسجلة
                </div>

                <div className="mt-3 text-2xl font-black">
                  {loading ? "—" : formatAmount(totalClaimed)}
                </div>

                {!loading &&
                Object.keys(claimedByAsset).length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(claimedByAsset).map(
                      ([asset, amount]) => (
                        <span
                          key={asset}
                          className="rounded-full bg-cyan-400/10 px-2.5 py-1 text-[10px] font-bold text-cyan-300"
                        >
                          {formatAmount(amount)} {asset}
                        </span>
                      )
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-black">
                  المكافآت المتاحة
                </h2>

                <span className="text-xs text-slate-500">
                  {loading ? "—" : `${rewards.length} مكافأة`}
                </span>
              </div>

              {loading ? (
                <div className="rounded-2xl border border-white/10 bg-[#07101d] p-12 text-center text-sm text-slate-500">
                  جاري تحميل صناديق المكافآت...
                </div>
              ) : rewards.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-[#07101d] p-12 text-center">
                  <div className="text-lg font-bold text-slate-300">
                    لا توجد مكافآت متاحة حاليًا
                  </div>

                  <p className="mt-2 text-sm text-slate-500">
                    ستظهر هنا أي مكافأة يمنحها لك النظام.
                  </p>
                </div>
              ) : (
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {rewards.map((reward) => {
                    const timer =
                      remaining[reward._id] ?? 0;

                    const expired =
                      reward.status === "expired" ||
                      (
                        reward.status === "available" &&
                        Boolean(reward.expiresAt) &&
                        timer <= 0
                      );

                    const canClaim =
                      reward.status === "available" &&
                      !expired;

                    return (
                      <div
                        key={reward._id}
                        className="relative overflow-hidden rounded-[28px] border border-cyan-400/10 bg-[#07101d] p-6 shadow-xl"
                      >
                        <div className="absolute -left-10 -top-10 h-28 w-28 rounded-full bg-cyan-400/10 blur-3xl" />

                        <div className="relative">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-[10px] font-bold text-cyan-300">
                                {reward.type === "bonus"
                                  ? "مكافأة"
                                  : reward.type === "cashback"
                                    ? "استرداد"
                                    : reward.type === "commission"
                                      ? "عمولة"
                                      : "مهمة"}
                              </div>

                              <h3 className="mt-2 text-lg font-black">
                                {reward.title}
                              </h3>
                            </div>

                            <span className="rounded-full bg-white/5 px-3 py-1 text-[10px] text-slate-400">
                              {expired
                                ? "منتهية"
                                : "متاحة"}
                            </span>
                          </div>

                          <div className="py-8 text-center">
                            <div className="text-4xl font-black">
                              {formatAmount(reward.amount)}
                            </div>

                            <div className="mt-1 text-sm font-bold text-cyan-300">
                              {reward.asset}
                            </div>

                            {reward.metadata?.amountMode ===
                            "random" ? (
                              <div className="mt-3 text-[11px] text-slate-500">
                                قيمة المكافأة تم تحديدها عشوائيًا
                                ضمن{" "}
                                {formatAmount(
                                  Number(
                                    reward.metadata.minAmount || 0
                                  )
                                )}{" "}
                                —{" "}
                                {formatAmount(
                                  Number(
                                    reward.metadata.maxAmount || 0
                                  )
                                )}{" "}
                                {reward.asset}
                              </div>
                            ) : null}
                          </div>

                          {reward.expiresAt ? (
                            <div className="rounded-2xl border border-white/10 bg-[#050a13] p-4 text-center">
                              <div className="text-[10px] text-slate-500">
                                الوقت المتبقي
                              </div>

                              <div className="mt-2 font-mono text-xl font-black">
                                {expired
                                  ? "00:00:00"
                                  : formatRemaining(timer)}
                              </div>

                              <div className="mt-2 text-[10px] text-slate-600">
                                تنتهي في{" "}
                                {formatDate(
                                  reward.expiresAt
                                )}
                              </div>
                            </div>
                          ) : null}

                          <button
                            type="button"
                            disabled={
                              !canClaim ||
                              busy === reward._id
                            }
                            onClick={() =>
                              void claim(reward._id)
                            }
                            className="mt-5 w-full rounded-2xl bg-lime-300 px-5 py-4 font-black text-black shadow-[0_0_24px_rgba(163,230,53,0.25)] transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
                          >
                            {busy === reward._id
                              ? "جاري استلام المكافأة..."
                              : expired
                                ? "انتهت صلاحيتها"
                                : "استلام المكافأة"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="mt-10">
              <div className="mb-4">
                <h2 className="text-lg font-black">
                  سجل المكافآت المستلمة
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  يعرض أحدث المكافآت التي سُجّل استلامها بنجاح.
                </p>
              </div>

              {loading ? (
                <div className="rounded-2xl border border-white/10 bg-[#07101d] p-10 text-center text-sm text-slate-500">
                  جاري تحميل سجل المكافآت...
                </div>
              ) : claimedRewards.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-[#07101d] p-10 text-center text-sm text-slate-500">
                  لم تستلم أي مكافآت حتى الآن.
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#07101d]">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px] text-right text-sm">
                      <thead className="border-b border-white/10 bg-white/[0.02] text-xs text-slate-500">
                        <tr>
                          <th className="px-5 py-4 font-bold">
                            المكافأة
                          </th>

                          <th className="px-5 py-4 font-bold">
                            القيمة
                          </th>

                          <th className="px-5 py-4 font-bold">
                            حالة الاستلام
                          </th>

                          <th className="px-5 py-4 font-bold">
                            تاريخ الاستلام
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {claimedRewards.map((reward) => (
                          <tr
                            key={reward._id}
                            className="border-b border-white/5 last:border-b-0"
                          >
                            <td className="px-5 py-4">
                              <div className="font-bold text-slate-200">
                                {reward.title || "مكافأة"}
                              </div>
                            </td>

                            <td className="px-5 py-4">
                              <span className="font-black text-emerald-300">
                                +{formatAmount(Number(reward.amount || 0))}
                              </span>

                              <span className="mr-2 text-xs text-slate-500">
                                {reward.asset}
                              </span>
                            </td>

                            <td className="px-5 py-4">
                              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">
                                تم الاستلام
                              </span>
                            </td>

                            <td className="px-5 py-4 text-xs text-slate-500">
                              {formatDate(reward.updatedAt || reward.createdAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </>
  );
}