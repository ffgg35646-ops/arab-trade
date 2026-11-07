import { AlertTriangle, Check, Copy, Globe, LockKeyhole, Scale, Shield, ShieldCheck } from "lucide-react";

const licenses = [
  {
    flag: "🇦🇪",
    name: "الإمارات العربية المتحدة",
    code: "SCA",
    description: "مرخصة من هيئة الأوراق المالية والسلع - فئة أولى",
    numberLabel: "رقم الترخيص",
    number: "20200000026",
    active: true,
  },
  {
    flag: "🇬🇧",
    name: "المملكة المتحدة",
    code: "FCA",
    description: "مرخصة من هيئة السلوك المالي البريطانية",
    numberLabel: "الرقم المرجعي: FRN",
    number: "528328",
  },
  {
    flag: "🇪🇺",
    name: "الاتحاد الأوروبي",
    code: "CySEC",
    description: "مرخصة من هيئة الأوراق المالية والبورصات القبرصية",
    numberLabel: "رقم الترخيص",
    number: "415/22",
  },
  {
    flag: "🇯🇴",
    name: "المملكة الأردنية الهاشمية",
    code: "JSC",
    description: "مسجلة لدى هيئة الأوراق المالية الأردنية",
    numberLabel: "رقم التسجيل",
    number: "50248",
  },
  {
    flag: "🌐",
    name: "الحسابات الدولية",
    code: "FSA",
    description: "مرخصة من هيئة الخدمات المالية - سيشل",
    numberLabel: "رقم الترخيص",
    number: "SD064",
  },
];

export default function LicensesContent() {
  return (
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
          <div className="mx-auto max-w-5xl">
            <section className="mb-8 text-right">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/5 px-4 py-2 text-xs font-semibold text-cyan-300">
                <Shield className="h-4 w-4" />
                الأمان والاعتمادات
              </div>
              <h1 className="text-4xl font-black leading-tight text-white md:text-6xl">
                منصة مرخصة ومؤمنة بالكامل
              </h1>
              <p className="mt-7 max-w-3xl text-base leading-8 text-slate-400 md:text-lg">
                تخضع EQUITI لرقابة مالية صارمة من قبل هيئات تنظيمية دولية وإقليمية لضمان حماية وأمان أموال العملاء.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="mb-4 text-xl font-extrabold text-white">أركان الأمان</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 text-center">
                  <div className="text-base font-extrabold text-white">⚖️ أموال مفصولة</div>
                  <p className="mt-2 text-sm leading-7 text-slate-400">حسابات بنكية مستقلة</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 text-center">
                  <div className="text-base font-extrabold text-white">🛡️ تأمين الودائع</div>
                  <p className="mt-2 text-sm leading-7 text-slate-400">تغطية تأمينية شاملة</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 text-center">
                  <div className="text-base font-extrabold text-white">⚖️ رقابة دورية</div>
                  <p className="mt-2 text-sm leading-7 text-slate-400">امتثال وتدقيق مالي</p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="mb-4 text-xl font-extrabold text-white">تراخيص المنصة</h2>
              <div className="space-y-4">
                {licenses.map((license) => (
                  <article
                    key={license.code}
                    className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 transition hover:border-white/20 sm:p-6"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 text-right">
                        <h3 className="text-base font-extrabold leading-7 text-white sm:text-lg">
                          {license.flag} {license.name} ({license.code})
                        </h3>
                        <p className="mt-2 text-sm leading-7 text-slate-400">{license.description}</p>
                      </div>
                      <Check
                        size={19}
                        strokeWidth={3}
                        className="mt-1 shrink-0 text-[#00afaa]"
                        aria-label="علامة صح"
                      />
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#07101d]/60 px-4 py-3 text-sm text-slate-200">
                      <span>{license.numberLabel}: {license.number}</span>
                      {license.active && <Copy size={15} className="shrink-0 text-slate-400" />}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <div className="mt-8 rounded-2xl border border-cyan-400/10 bg-cyan-400/[0.03] p-6">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-cyan-200">
                <AlertTriangle className="h-4 w-4" />
                إخلاء مسؤولية وتحذير المخاطر
              </div>
              <p className="text-sm leading-8 text-slate-400">
                إن التداول ينطوي على مخاطر رأس المال. نحن ملتزمون بفصل أموال العملاء تمامًا عن أموال الشركة التشغيلية في حسابات بنكية موثوقة وفق المعايير الرقابية.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
