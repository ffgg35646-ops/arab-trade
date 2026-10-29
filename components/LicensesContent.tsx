import { AlertTriangle, BadgeCheck, Copy, Globe, LockKeyhole, Scale, Shield, ShieldCheck } from "lucide-react";

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
    <main dir="rtl" className="min-h-screen bg-[#07101a] px-3 py-5 text-white sm:px-5 sm:py-7">
      <div className="mx-auto max-w-4xl">
        <section className="mb-6 text-right">
          <div className="mb-3 flex justify-end">
            <Shield className="h-14 w-14 fill-blue-500/15 text-blue-500 sm:h-16 sm:w-16" strokeWidth={2.2} />
          </div>
          <h1 className="text-2xl font-black leading-tight sm:text-3xl">منصة مرخصة ومؤمنة بالكامل</h1>
          <p className="mt-2 text-sm leading-7 text-slate-300 sm:text-base">
            تخضع عرب تريد لرقابة مالية صارمة من قبل هيئات تنظيمية دولية وإقليمية لضمان حماية وأمان أموال العملاء.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="mb-3 text-xl font-extrabold">أركان الأمان</h2>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-slate-600/70 bg-[#171e28] px-2 py-3 text-center shadow-sm shadow-black/20">
              <div className="text-sm font-extrabold sm:text-base">⚖️ أموال مفصولة</div>
              <p className="mt-1 text-xs leading-5 text-slate-300 sm:text-sm">حسابات بنكية مستقلة</p>
            </div>
            <div className="rounded-2xl border border-slate-600/70 bg-[#171e28] px-2 py-3 text-center shadow-sm shadow-black/20">
              <div className="text-sm font-extrabold sm:text-base">🛡️ تأمين الودائع</div>
              <p className="mt-1 text-xs leading-5 text-slate-300 sm:text-sm">تغطية تأمينية شاملة</p>
            </div>
            <div className="rounded-2xl border border-slate-600/70 bg-[#171e28] px-2 py-3 text-center shadow-sm shadow-black/20">
              <div className="text-sm font-extrabold sm:text-base">⚖️ رقابة دورية</div>
              <p className="mt-1 text-xs leading-5 text-slate-300 sm:text-sm">امتثال وتدقيق مالي</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-extrabold">تراخيص المنصة</h2>
          <div className="space-y-2">
            {licenses.map((license) => (
              <article key={license.code} className="rounded-[22px] border border-slate-600/80 bg-[#171e28] p-3.5 shadow-[0_4px_14px_rgba(0,0,0,0.22)] sm:p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 text-right">
                    <h3 className="text-base font-extrabold leading-6 sm:text-lg">
                      {license.flag} {license.name} ({license.code})
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-slate-300">{license.description}</p>
                  </div>
                  {license.active && (
                    <span className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/20 px-2 py-1 text-xs font-bold text-emerald-300">
                      نشط <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-slate-700/80 bg-[#10283d] px-3 py-2 text-sm">
                  <span className="text-slate-200">{license.numberLabel}: {license.number}</span>
                  {license.active && <Copy size={15} className="shrink-0 text-slate-400" />}
                </div>
              </article>
            ))}
          </div>
        </section>

        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-amber-400/20 bg-[#171e28] p-3 text-xs leading-6 text-slate-300 sm:text-sm">
          <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-amber-400" />
          <p><span className="font-bold text-amber-300">إخلاء مسؤولية وتحذير المخاطر:</span> إن التداول ينطوي على مخاطر رأس المال. نحن ملتزمون بفصل أموال العملاء تمامًا عن أموال الشركة التشغيلية في حسابات بنكية موثوقة وفق المعايير الرقابية.</p>
        </div>
      </div>
    </main>
  );
}
