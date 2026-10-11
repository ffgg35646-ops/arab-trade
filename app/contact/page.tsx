import Link from "next/link";

export const dynamic = "force-dynamic";
import { getPlatformSettings } from "@/lib/platform-settings";
import {
  ArrowRight,
  Mail,
  MessageCircle,
  Send,
  ShieldCheck,
} from "lucide-react";

export default async function ContactPage() {
  const settings = await getPlatformSettings();

  const telegram =
    settings.support?.telegram || "";

  const facebook =
    settings.support?.facebook || "";

  const email =
    settings.support?.email || "";

  return (
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

        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-[#07101d]/80 shadow-2xl backdrop-blur-2xl">

          <div className="grid lg:grid-cols-[1.05fr_.95fr]">

            <div className="p-7 md:p-12 lg:p-16">

              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/5 px-4 py-2 text-xs font-semibold text-cyan-300">
                <MessageCircle size={15} />
                نحن هنا لمساعدتك
              </div>

              <h1 className="max-w-xl text-4xl font-black leading-tight md:text-5xl">
                تواصل معنا،
                <span className="mt-2 block bg-gradient-to-l from-cyan-300 to-blue-500 bg-clip-text text-transparent">
                  نحن نسمعك.
                </span>
              </h1>

              <p className="mt-7 max-w-xl text-base leading-8 text-slate-400">
                سواء كان لديك استفسار حول المنصة، أو تحتاج إلى مساعدة في
                استخدام إحدى الخدمات، أو ترغب في مشاركة اقتراح يساعدنا على
                تطوير عرب تريد، يمكنك التواصل معنا في أي وقت.
              </p>

              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-500">
                نحرص على أن تكون تجربة المستخدم واضحة وسلسة، ونسعى دائمًا
                إلى تقديم تجربة احترافية تجمع بين سهولة الاستخدام وسرعة
                الوصول إلى المعلومات.
              </p>

              <div className="mt-9 grid gap-4 sm:grid-cols-2">

                <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
                  <ShieldCheck className="mb-3 text-cyan-400" size={23} />
                  <h3 className="font-bold">دعم موثوق</h3>
                  <p className="mt-2 text-xs leading-6 text-slate-500">
                    قنوات تواصل واضحة ومباشرة لخدمة المستخدمين.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
                  <MessageCircle className="mb-3 text-blue-400" size={23} />
                  <h3 className="font-bold">تواصل مباشر</h3>
                  <p className="mt-2 text-xs leading-6 text-slate-500">
                    اختر القناة الأنسب لك وتواصل معنا بسهولة.
                  </p>
                </div>

              </div>
            </div>

            <div className="border-t border-white/10 bg-[#050a13]/70 p-7 md:p-12 lg:border-r lg:border-t-0 lg:p-12">

              <div className="mb-8">
                <p className="text-xs font-semibold text-cyan-400">
                  قنوات التواصل
                </p>

                <h2 className="mt-2 text-2xl font-bold">
                  كيف يمكننا مساعدتك؟
                </h2>

                <p className="mt-3 text-sm leading-6 text-slate-500">
                  يمكنك اختيار إحدى وسائل التواصل التالية.
                </p>
              </div>

              <div className="space-y-4">

                <a
                  href={telegram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.025] p-5 transition hover:-translate-y-1 hover:border-cyan-400/30 hover:bg-cyan-400/[0.04]"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10">
                    <Send size={22} className="text-cyan-400" />
                  </div>

                  <div className="min-w-0">
                    <h3 className="font-bold">تليجرام</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      تواصل معنا مباشرة عبر تليجرام
                    </p>
                  </div>

                  <ArrowRight
                    size={18}
                    className="mr-auto text-slate-600 transition group-hover:text-cyan-400"
                  />
                </a>

                <a
                  href={facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.025] p-5 transition hover:-translate-y-1 hover:border-blue-400/30 hover:bg-blue-400/[0.04]"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                    <MessageCircle size={22} className="text-blue-400" />
                  </div>

                  <div className="min-w-0">
                    <h3 className="font-bold">فيسبوك</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      تابع أخبارنا وتواصل معنا
                    </p>
                  </div>

                  <ArrowRight
                    size={18}
                    className="mr-auto text-slate-600 transition group-hover:text-blue-400"
                  />
                </a>

                <a
                  href={`mailto:${email}`}
                  className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.025] p-5 transition hover:-translate-y-1 hover:border-blue-400/30 hover:bg-blue-400/[0.04]"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                    <Mail size={22} className="text-blue-400" />
                  </div>

                  <div className="min-w-0">
                    <h3 className="font-bold">البريد الإلكتروني</h3>
                    <p className="mt-1 break-all text-xs text-slate-500">
                      {email}
                    </p>
                  </div>

                  <ArrowRight
                    size={18}
                    className="mr-auto text-slate-600 transition group-hover:text-blue-400"
                  />
                </a>

              </div>

              <div className="mt-7 rounded-2xl border border-blue-400/10 bg-blue-500/[0.04] p-5">
                <p className="text-xs leading-6 text-slate-500">
                  عند التواصل معنا، اذكر تفاصيل المشكلة أو الاستفسار بشكل
                  واضح حتى نتمكن من مساعدتك بشكل أسرع.
                </p>
              </div>

            </div>

          </div>

        </section>

        <p className="mt-7 text-center text-xs text-slate-600">
          عرب تريد — منصة عربية حديثة لعالم الأسواق والتداول
        </p>

      </div>
    </main>
  );
}