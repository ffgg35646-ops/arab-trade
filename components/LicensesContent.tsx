import { BadgeCheck, FileCheck2, LockKeyhole, ShieldCheck } from "lucide-react";

const principles = [
  {
    icon: FileCheck2,
    title: "الشفافية",
    description: "عرض معلومات الترخيص والجهات التنظيمية بوضوح عند توفر بيانات رسمية قابلة للتحقق.",
  },
  {
    icon: LockKeyhole,
    title: "الأمان",
    description: "اتبع ممارسات الأمان الأساسية، ولا تشارك كلمة المرور أو رموز التحقق مع أي شخص.",
  },
  {
    icon: BadgeCheck,
    title: "التحقق من المعلومات",
    description: "يجب التأكد من أرقام التراخيص والجهات المصدرة عبر المواقع الرسمية للجهات التنظيمية.",
  },
];

export default function LicensesContent() {
  return (
    <main dir="rtl" className="min-h-screen bg-[#050a13] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-7 rounded-3xl border border-white/10 bg-gradient-to-bl from-blue-500/10 via-[#07101d] to-[#07101d] p-6 sm:p-9">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-500/10 text-blue-300">
            <ShieldCheck size={30} />
          </div>
          <p className="mb-2 text-xs font-bold tracking-wide text-cyan-300">EQUITI · TRUST & SECURITY</p>
          <h1 className="text-2xl font-black sm:text-4xl">التراخيص والأمان</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate-400 sm:text-base">
            تجمع هذه الصفحة معلومات الترخيص والضوابط الأمنية الخاصة بالمنصة في مكان واحد.
            يجب الرجوع إلى المصادر الرسمية للتحقق من أي جهة تنظيمية أو رقم ترخيص قبل الاعتماد عليه.
          </p>
        </header>

        <section className="mb-8">
          <h2 className="mb-4 text-lg font-bold">الشفافية والحماية</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {principles.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="rounded-2xl border border-white/10 bg-[#0f1a2e] p-4 sm:p-5">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300">
                    <Icon size={21} />
                  </div>
                  <h3 className="font-bold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-400">{item.description}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-lg font-bold">بيانات التراخيص</h2>
          <div className="rounded-2xl border border-amber-300/20 bg-[#0f1a2e] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-300/10 text-amber-200">
                <FileCheck2 size={21} />
              </span>
              <div>
                <h3 className="font-bold text-white">بيانات الجهات التنظيمية وأرقام التراخيص</h3>
                <p className="mt-2 text-sm leading-7 text-slate-400">
                  الجزء المرسل من الكود ينتهي قبل تفاصيل الجهات وأرقام التراخيص. لذلك لم تتم إضافة أسماء جهات أو أرقام غير متحقَّق منها.
                  يمكن إدراج بيانات الترخيص الرسمية هنا بعد توفيرها والتحقق منها.
                </p>
              </div>
            </div>
          </div>
        </section>

        <p className="mt-6 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-xs leading-6 text-slate-500">
          تنبيه: ظهور هذه الصفحة لا يُعد بحد ذاته إثباتًا على وجود ترخيص أو اعتماد تنظيمي. تحقّق من بيانات الجهة مباشرة عبر مصدرها الرسمي.
        </p>
      </div>
    </main>
  );
}
