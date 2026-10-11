import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function Page() {
  return (
    <main className="min-h-screen bg-[#050a13] text-white">
      <Navbar />

      <section
        dir="rtl"
        className="min-h-[calc(100vh-160px)] px-4 pb-20 pt-32"
      >
        <div className="mx-auto max-w-[1500px]">

          <div className="mb-8">
            <div className="text-sm font-bold text-cyan-400">
              التداول
            </div>

            <h1 className="mt-2 text-3xl font-black md:text-4xl">
              شبكات التداول
            </h1>

            <p className="mt-3 text-sm leading-7 text-slate-400">
              أنشئ استراتيجية تداول تعتمد على نطاقات وشبكات سعرية.
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#07101d] p-8">
            <div className="grid gap-4 md:grid-cols-3">

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                <div className="text-xs text-white/35">
                  حالة السوق
                </div>
                <div className="mt-2 text-lg font-black text-emerald-400">
                  السوق مفتوح
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                <div className="text-xs text-white/35">
                  الأصول المتاحة
                </div>
                <div className="mt-2 text-lg font-black text-white">
                  قريبًا
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                <div className="text-xs text-white/35">
                  حالة النظام
                </div>
                <div className="mt-2 text-lg font-black text-cyan-400">
                  جاهز
                </div>
              </div>

            </div>

            <div className="mt-6 rounded-xl border border-dashed border-white/10 p-8 text-center">
              <div className="text-lg font-black text-white">
                واجهة شبكات التداول
              </div>

              <p className="mt-2 text-sm text-white/35">
                سيتم بناء تفاصيل التداول الكاملة لهذا القسم في المرحلة التالية.
              </p>
            </div>
          </div>

        </div>
      </section>

      <Footer />
    </main>
  );
}