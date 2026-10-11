"use client";
import { apiFetch } from "@/lib/frontend-api";

import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";
import { Copy, Users } from "lucide-react";
import { useEffect, useState } from "react";

export default function ReferralPage() {
  const [referral, setReferral] = useState<any>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/referral", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setReferral(d?.referral || null))
      .catch(() => {});
  }, []);

  async function copy() {
    if (!referral?.code) return;
    await navigator.clipboard.writeText(referral.code);
    setMessage("تم نسخ كود الإحالة");
  }

  return (
    <>
      <InternalNavbar />
      <div className="mx-auto flex max-w-[1700px]">
        <InternalSidebar />
        <main dir="rtl" className="min-w-0 flex-1 bg-[#050a13] text-white">
          <div className="p-4 md:p-6 lg:p-8">
            <section className="rounded-3xl border border-white/10 bg-gradient-to-l from-blue-500/[0.12] to-cyan-400/[0.03] p-6 md:p-8">
              <div className="grid gap-6 lg:grid-cols-[1.3fr_0.8fr]">
                <div>
                  <div className="text-[10px] text-slate-600">REFERRAL</div>
                  <h1 className="mt-3 text-3xl font-bold">
                    برنامج الإحالة
                  </h1>
                  <p className="mt-3 max-w-2xl text-xs leading-7 text-slate-500">
                    كود الإحالة الفعلي المرتبط بحسابك.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#050a13]/60 p-5">
                  <div className="text-[10px] text-slate-600">الكود</div>
                  <div className="mt-3 flex gap-2">
                    <div className="flex-1 rounded-xl border border-white/10 bg-[#050a13] px-4 py-3 font-mono text-sm">
                      {referral?.code || "—"}
                    </div>

                    <button
                      type="button"
                      onClick={copy}
                      className="rounded-xl border border-white/10 p-3 text-slate-300 hover:bg-white/5"
                    >
                      <Copy size={16} />
                    </button>
                  </div>

                  {message && (
                    <div className="mt-3 text-[10px] text-emerald-300">
                      {message}
                    </div>
                  )}
                </div>
              </div>
            </section>

            <div className="mt-6 grid gap-3 md:grid-cols-4">
              {[
                ["المستخدمون المدعوون", referral?.invited ?? "—"],
                ["المستخدمون النشطون", referral?.active ?? "—"],
                [
                  "عمولة الإحالة",
                  referral?.enabled === false
                    ? "متوقفة"
                    : `${referral?.commissionPercent ?? 0}%`,
                ],
                [
                  "أرباح الإحالة",
                  referral?.earnings == null
                    ? "—"
                    : `${referral.earnings} USDT`,
                ],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
                  <div className="text-[10px] text-slate-600">{label}</div>
                  <div className="mt-3 text-2xl font-semibold">{value}</div>
                </div>
              ))}
            </div>

            <section className="mt-6 rounded-2xl border border-white/10 bg-[#07101d] p-6">
              <Users size={21} className="text-cyan-300" />
              <h2 className="mt-4 font-bold">الإحالات</h2>
              <p className="mt-2 text-xs leading-6 text-slate-600">
                سيتم احتساب الأرباح تلقائيًا عند ربط نظام العمولات والحركات المالية.
              </p>
            </section>
          </div>
        </main>
      </div>
    </>
  );
}

/* ARABTRADE_API_LAYER: /api/referral,/api/referral/commissions */