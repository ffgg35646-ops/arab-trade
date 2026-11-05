import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ArrowRight, BarChart3, ShieldCheck, Zap } from "lucide-react";

export default function AboutPage() {
  return (
    <>
      <Navbar />
    <main className="arabtrade-auth-hero min-h-screen overflow-hidden px-4 py-28 text-white">

      <div className="arabtrade-auth-coins" aria-hidden="true">
        <span className="arabtrade-auth-coin">₿</span>
        <span className="arabtrade-auth-coin">Ξ</span>
        <span className="arabtrade-auth-coin">₿</span>
        <span className="arabtrade-auth-coin">◎</span>
        <span className="arabtrade-auth-coin">Ξ</span>
      </div>

      <div className="arabtrade-auth-lines" aria-hidden="true" />
      <div className="arabtrade-auth-candles" aria-hidden="true" />

      <div className="relative z-10 mx-auto max-w-6xl">

        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-2 text-sm text-slate-400 transition hover:border-cyan-400/20 hover:bg-cyan-400/[0.06] hover:text-cyan-300"
        >
          <ArrowRight size={17} />
          العودة إلى الصفحة الرئيسية
        </Link>

        <section className="rounded-[32px] border border-white/10 bg-[#07101d]/80 p-7 shadow-2xl backdrop-blur-2xl md:p-12 lg:p-16">

          <div className="max-w-3xl">

            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/5 px-4 py-2 text-xs font-semibold text-cyan-300">
              <BarChart3 size={15} />
              عن عرب تريد
            </div>

            <h1 className="text-4xl font-black leading-tight md:text-6xl">
              عالم الأسواق،
              <span className="mt-2 block bg-gradient-to-l from-cyan-300 to-blue-500 bg-clip-text text-transparent">
                بطريقة أذكى.
              </span>
            </h1>

            <p className="mt-7 text-base leading-8 text-slate-400 md:text-lg">
              عرب تريد هي منصة عربية حديثة تهدف إلى تقديم تجربة احترافية
              لمتابعة الأسواق والأصول الرقمية، من خلال واجهة واضحة وسريعة
              تجمع بين البيانات، التحليلات، وأدوات متابعة السوق في مكان واحد.
            </p>

            <p className="mt-5 text-sm leading-7 text-slate-500 md:text-base">
              نعمل على بناء تجربة تجمع بين التصميم العالمي واللغة العربية،
              بحيث يستطيع المستخدم الوصول إلى معلومات السوق وفهم تحركاته
              بسهولة ووضوح.
            </p>

          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">

            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
              <BarChart3 className="mb-5 text-cyan-400" size={28} />
              <h2 className="text-lg font-bold">بيانات السوق</h2>
              <p className="mt-3 text-sm leading-7 text-slate-500">
                متابعة الأسعار وحركة الأسواق بطريقة منظمة وسهلة القراءة.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
              <Zap className="mb-5 text-blue-400" size={28} />
              <h2 className="text-lg font-bold">تجربة سريعة</h2>
              <p className="mt-3 text-sm leading-7 text-slate-500">
                تصميم حديث ومتجاوب يجعل الوصول إلى أدوات المنصة أكثر سهولة.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
              <ShieldCheck className="mb-5 text-cyan-400" size={28} />
              <h2 className="text-lg font-bold">الوضوح والثقة</h2>
              <p className="mt-3 text-sm leading-7 text-slate-500">
                نركز على تقديم المعلومات بصورة واضحة مع تجربة استخدام
                احترافية ومباشرة.
              </p>
            </div>

          </div>

          <div className="mt-8 rounded-2xl border border-cyan-400/10 bg-cyan-400/[0.03] p-6">
            <h2 className="text-lg font-bold">رؤيتنا</h2>
            <p className="mt-3 text-sm leading-7 text-slate-500">
              أن تصبح عرب تريد مساحة عربية متكاملة لفهم الأسواق ومتابعة
              تحركات الأصول الرقمية، مع الحفاظ على تصميم عالمي وتجربة عربية
              بسيطة ومريحة.
            </p>
          </div>

        </section>

        <p className="mt-7 text-center text-xs text-slate-600">
          عرب تريد — منصة عربية حديثة لعالم الأسواق والتداول
        </p>

      </div>
    </main>
      <Footer />
    </>
  );
}