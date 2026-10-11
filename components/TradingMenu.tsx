 "use client";

import Link from "next/link";
import {
  CandlestickChart,
  ChartNoAxesCombined,
  Bot,
  Copy,
  Layers3,
} from "lucide-react";

const items = [
  {
    href: "/trading/spot",
    title: "السوق الفوري",
    description: "شراء وبيع الأصول بالسعر الفوري",
    icon: CandlestickChart,
  },
  {
    href: "/trading/futures",
    title: "العقود الآجلة",
    description: "تداول العقود وإدارة المراكز",
    icon: ChartNoAxesCombined,
  },
  {
    href: "/trading/grid",
    title: "شبكات التداول",
    description: "استراتيجية تداول آلية بالشبكات",
    icon: Layers3,
  },
  {
    href: "/trading/copy",
    title: "نسخ التداول",
    description: "تابع وانسخ استراتيجيات المتداولين",
    icon: Copy,
  },
  {
    href: "/trading/margin",
    title: "التداول بالهامش",
    description: "تداول بالهامش مع إدارة المخاطر",
    icon: Bot,
  },
];

export default function TradingMenu() {
  return (
    <section dir="rtl" className="px-4 pb-16 pt-28">
      <div className="mx-auto max-w-[1500px]">

        <div className="mb-8">
          <span className="text-sm font-bold text-cyan-400">
            عرب تريد
          </span>

          <h1 className="mt-2 text-3xl font-black text-white md:text-4xl">
            التداول
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
            اختر نوع التداول الذي يناسب استراتيجيتك واستكشف أدوات السوق
            المتاحة من خلال واجهة موحدة.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-2xl border border-white/[0.08] bg-[#07101d] p-6 transition duration-300 hover:-translate-y-1 hover:border-cyan-400/20 hover:bg-[#091522]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-400 transition group-hover:bg-cyan-400/15">
                    <Icon size={23} />
                  </div>

                  <span className="text-white/20 transition group-hover:text-cyan-400">
                    ←
                  </span>
                </div>

                <h2 className="mt-6 text-lg font-black text-white">
                  {item.title}
                </h2>

                <p className="mt-2 text-sm leading-7 text-slate-500">
                  {item.description}
                </p>

                <div className="mt-6 text-xs font-bold text-cyan-400">
                  دخول إلى القسم
                </div>
              </Link>
            );
          })}
        </div>

      </div>
    </section>
  );
}