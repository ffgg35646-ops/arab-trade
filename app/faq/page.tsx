import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const questions = [
  {
    q: "ما هي EQUITI؟",
    a: "EQUITI هي منصة عربية لعرض الأسواق وتجربة واجهات التداول ومتابعة بيانات الأصول الرقمية.",
  },
  {
    q: "كيف يمكنني متابعة الأسواق؟",
    a: "يمكنك الدخول إلى صفحة الأسواق لاستعراض الأصول والأسعار وحركة السوق المتاحة على المنصة.",
  },
  {
    q: "ما الفرق بين التداول الفوري والتداول الاحترافي؟",
    a: "التداول الفوري يوفر واجهة مباشرة لمتابعة الأصول، بينما التداول الاحترافي يقدم واجهة تداول أكثر تفصيلًا تشمل الرسم البياني ودفتر الأوامر وأدوات السوق.",
  },
  {
    q: "هل الأسعار المعروضة هي أسعار السوق؟",
    a: "تعتمد البيانات المعروضة على مصادر بيانات السوق التي تستخدمها المنصة، وقد تختلف الأسعار أو تتأخر بحسب مصدر البيانات والاتصال.",
  },
  {
    q: "هل التداول ينطوي على مخاطر؟",
    a: "نعم. الأصول المالية والأسواق الرقمية قد تشهد تغيرات سعرية كبيرة، ولذلك يجب فهم المخاطر قبل اتخاذ أي قرار مالي.",
  },
  {
    q: "كيف يمكنني التواصل مع المنصة؟",
    a: "يمكنك استخدام صفحة تواصل معنا للوصول إلى وسائل التواصل المتاحة على المنصة.",
  },
];

export default function FAQPage() {
  return (
    <>
      <Navbar />
      <main dir="rtl" className="arabtrade-auth-hero min-h-screen overflow-hidden px-4 py-28 text-white">

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
        <section className="rounded-[32px] border border-white/10 bg-[#07101d]/80 p-7 shadow-2xl backdrop-blur-2xl md:p-12 lg:p-16">

      <div className="mx-auto max-w-5xl px-0 py-0">

        <Link
          href="/"
          className="text-sm text-cyan-400 hover:text-cyan-300"
        >
          ← العودة للرئيسية
        </Link>

        <div className="mt-10">
          <div className="text-sm font-semibold text-cyan-400">
            الدعم
          </div>

          <h1 className="mt-3 text-4xl font-bold">
            الأسئلة الشائعة
          </h1>

          <p className="mt-4 max-w-2xl text-sm leading-8 text-slate-400">
            إجابات مختصرة عن أكثر الأسئلة المتعلقة بالمنصة والأسواق
            وتجربة التداول.
          </p>
        </div>

        <div className="mt-10 space-y-3">
          {questions.map((item) => (
            <div
              key={item.q}
              className="rounded-2xl border border-white/10 bg-white/[0.025] p-6"
            >
              <h2 className="text-base font-bold">
                {item.q}
              </h2>

              <p className="mt-3 text-sm leading-8 text-slate-400">
                {item.a}
              </p>
            </div>
          ))}
        </div>

        </div>
        </section>
      </div>
      </main>
      <Footer />
    </>
  );
}