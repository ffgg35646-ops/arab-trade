import Link from "next/link";
import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";
import {
  ArrowLeftRight,
  CircleDollarSign,
  Clock3,
  History,
  WalletCards,
} from "lucide-react";

import { Frame } from "@/components/dashboard/AccountUI";

const actions = [
  {
    title: "سبوت ← تمويل",
    description: "تحويل الأصول من حساب التداول الفوري إلى حساب التمويل.",
    href: "/dashboard/assets/transfer",
    icon: ArrowLeftRight,
  },
  {
    title: "تمويل ← سبوت",
    description: "إرجاع الأصول من حساب التمويل إلى حساب التداول الفوري.",
    href: "/dashboard/assets/transfer",
    icon: ArrowLeftRight,
  },
  {
    title: "سجل التحويلات",
    description: "عرض ومراجعة عمليات التحويل المرتبطة بالحساب.",
    href: "/dashboard/assets/transfer",
    icon: History,
  },
];

export default function Page() {
  return (
    <>
      <InternalNavbar />

      <div className="mx-auto flex max-w-[1700px]">
        <InternalSidebar />

        <div className="min-w-0 flex-1">
          <Frame
            title="التمويل"
            description="إدارة أصول حساب التمويل والتحويلات المرتبطة به."
            icon={CircleDollarSign}
          >
            <div className="space-y-6">
              {/* Summary */}
              <section className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      رصيد حساب التمويل
                    </span>

                    <WalletCards
                      size={18}
                      className="text-cyan-300"
                    />
                  </div>

                  <div className="mt-4 text-3xl font-bold text-white">
                    —
                  </div>

                  <p className="mt-2 text-[11px] text-slate-600">
                    سيظهر الرصيد الفعلي عند ربط حساب التمويل بمصدر الأرصدة.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      متاح للتحويل
                    </span>

                    <ArrowLeftRight
                      size={18}
                      className="text-cyan-300"
                    />
                  </div>

                  <div className="mt-4 text-3xl font-bold text-white">
                    —
                  </div>

                  <p className="mt-2 text-[11px] text-slate-600">
                    يعتمد على الرصيد المتاح الفعلي في الحساب.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#07101d] p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      عمليات قيد المعالجة
                    </span>

                    <Clock3
                      size={18}
                      className="text-cyan-300"
                    />
                  </div>

                  <div className="mt-4 text-3xl font-bold text-white">
                    —
                  </div>

                  <p className="mt-2 text-[11px] text-slate-600">
                    ستظهر هنا عمليات التحويل المعلقة عند توفر بياناتها.
                  </p>
                </div>
              </section>

              {/* Transfer section */}
              <section className="rounded-2xl border border-white/10 bg-[#07101d] p-6">
                <div className="flex flex-col gap-2">
                  <h2 className="text-lg font-bold text-white">
                    التحويل بين الحسابات
                  </h2>

                  <p className="text-xs leading-6 text-slate-500">
                    استخدم صفحة التحويل لإدارة حركة الأصول بين حساب التداول
                    الفوري وحساب التمويل.
                  </p>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  {actions.map((action) => {
                    const Icon = action.icon;

                    return (
                      <Link
                        key={action.title}
                        href={action.href}
                        className="group rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition hover:-translate-y-0.5 hover:border-cyan-400/30 hover:bg-white/[0.04]"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/5">
                          <Icon
                            size={19}
                            className="text-cyan-300"
                          />
                        </div>

                        <h3 className="mt-5 text-sm font-bold text-white">
                          {action.title}
                        </h3>

                        <p className="mt-2 text-xs leading-6 text-slate-500">
                          {action.description}
                        </p>

                        <div className="mt-5 text-[11px] font-semibold text-cyan-300">
                          فتح التحويل ←
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>

              {/* Information */}
              <section className="rounded-2xl border border-white/10 bg-[#07101d] p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/5">
                    <CircleDollarSign
                      size={19}
                      className="text-cyan-300"
                    />
                  </div>

                  <div>
                    <h2 className="text-sm font-bold text-white">
                      حول حساب التمويل
                    </h2>

                    <p className="mt-2 max-w-3xl text-xs leading-7 text-slate-500">
                      حساب التمويل مخصص لفصل الأصول عن حساب التداول الفوري
                      وإدارة التحويلات بينها. البيانات المالية في هذه الصفحة
                      يجب أن تعتمد على مصدر المحفظة الفعلي حتى لا تظهر أرصدة
                      غير دقيقة.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </Frame>
        </div>
      </div>
    </>
  );
}
