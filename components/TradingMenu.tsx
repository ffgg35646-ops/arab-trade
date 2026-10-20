"use client";

import Link from "next/link";
import { Activity, Bot, CandlestickChart } from "lucide-react";

export default function TradingMenu() {
  return (
    <section dir="rtl" className="px-4 pb-16 pt-28">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-8">
          <span className="text-sm font-bold text-cyan-400">عرب تريد</span>
          <h1 className="mt-2 text-3xl font-black text-white md:text-4xl">التداول</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
            تداول فوري بالسوق، أو اضبط شروط دخول وخروج تراقب السعر وتنفّذها يدويًا أو عبر بوت آلي.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/trading/spot"
            className="group rounded-2xl border border-white/[0.08] bg-[#07101d] p-6 transition duration-300 hover:-translate-y-1 hover:border-cyan-400/20 hover:bg-[#091522]"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-400 transition group-hover:bg-cyan-400/15">
                <CandlestickChart size={23} />
              </div>
              <span className="text-white/20 transition group-hover:text-cyan-400">←</span>
            </div>
            <h2 className="mt-6 text-lg font-black text-white">التداول الفوري</h2>
            <p className="mt-2 text-sm leading-7 text-slate-500">شراء وبيع يدوي بأمر سوق فوري أو سعر محدد، مع سجل تنفيذ Binance.</p>
            <div className="mt-6 text-xs font-bold text-cyan-400">فتح شاشة التداول</div>
          </Link>

          <Link
            href="/trading/strategy"
            className="group rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-[#08202a] to-[#07101d] p-6 transition duration-300 hover:-translate-y-1 hover:border-cyan-300/40"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300 transition group-hover:bg-emerald-400/15">
                <Bot size={23} />
              </div>
              <span className="text-white/20 transition group-hover:text-cyan-400">←</span>
            </div>
            <h2 className="mt-6 text-lg font-black text-white">استراتيجيات وبوت التداول</h2>
            <p className="mt-2 text-sm leading-7 text-slate-400">حدّد سعر الدخول وهدف البيع ووقف الخسارة. اختر إشارات يدوية أو تشغيل بوت ينفّذ آليًا.</p>
            <div className="mt-6 inline-flex items-center gap-2 text-xs font-bold text-emerald-300">
              <Activity size={14} /> إعداد قواعد التداول
            </div>
          </Link>
        </div>
      </div>
    </section>
  );
}
