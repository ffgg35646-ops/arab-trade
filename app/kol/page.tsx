import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function KOLPage() {
  return (
    <main dir="rtl" className="min-h-screen bg-[#050a13] text-white">
      <Navbar />

      <section className="relative overflow-hidden px-5 py-16">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-20 top-20 text-7xl font-black text-blue-400/[0.025]">
            KOL
          </div>
          <div className="absolute right-20 bottom-20 text-6xl font-black text-cyan-400/[0.02]">
            TRADE
          </div>
        </div>

        <div className="relative mx-auto max-w-6xl">
          <div className="rounded-3xl border border-white/10 bg-[#07101d]/80 p-8 backdrop-blur-xl sm:p-12">
            <span className="text-sm font-semibold text-cyan-300">
              عرب تريد
            </span>

            <h1 className="mt-4 text-3xl font-black sm:text-5xl">
              التداول الاجتماعي
            </h1>

            <p className="mt-5 max-w-2xl text-sm leading-8 text-slate-400">
              مساحة مخصصة للتداول الاجتماعي ومتابعة المتداولين المميزين.
              سيتم عرض المتداولين وبيانات الأداء من النظام الحقيقي عند
              توفر مصدر البيانات الخاص بها.
            </p>

            <div className="mt-8 rounded-2xl border border-white/10 bg-black/10 p-8 text-center text-sm text-slate-500">
              لا توجد بيانات KOL حقيقية متاحة حاليًا.
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}