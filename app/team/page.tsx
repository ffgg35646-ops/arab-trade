import Image from "next/image";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ArrowLeft, Globe2, Lightbulb, ShieldCheck, Users2 } from "lucide-react";

const teamImages = [
  { src: "/team/team-01.jpeg", alt: "صورة من فريق EQUITI" },
  { src: "/team/team-02.jpeg", alt: "صورة من فريق EQUITI" },
  { src: "/team/team-03.jpeg", alt: "صورة من فريق EQUITI" },
  { src: "/team/team-04.jpeg", alt: "صورة من فريق EQUITI" },
];

const pillars = [
  {
    icon: Users2,
    title: "فريق متعدد الخبرات",
    text: "نؤمن أن جودة العمل تبدأ من تعاون الأشخاص وتكامل وجهات النظر. لذلك نهتم بأن تعمل الخبرات المختلفة بروح واحدة، وأن يكون لكل تفصيل دوره في تحسين التجربة التي نقدمها.",
  },
  {
    icon: Lightbulb,
    title: "تقنية وابتكار",
    text: "التقنية بالنسبة لنا وسيلة لتبسيط التفاصيل وتسهيل الوصول إلى المعلومات. نراجع تجربة الاستخدام باستمرار، ونسعى إلى تطوير الأدوات والواجهات لتكون أكثر وضوحًا وسلاسة.",
  },
  {
    icon: Globe2,
    title: "نظرة واسعة للأسواق",
    text: "تتحرك الأسواق في بيئة متغيرة ومترابطة، ولهذا نولي اهتمامًا لفهم احتياجات المستخدمين وتقديم تجربة تساعدهم على متابعة المعلومات والنظر إلى السوق بصورة أكثر تنظيمًا.",
  },
  {
    icon: ShieldCheck,
    title: "الوضوح والمسؤولية",
    text: "نحرص على أن تكون المعلومات وطريقة عرضها واضحة، وأن يجد المستخدم تجربة منظمة تساعده على فهم الأدوات المتاحة. فالوضوح والاهتمام بالتفاصيل جزء أساسي من طريقة عملنا.",
  },
];

const workSteps = [
  {
    number: "01",
    title: "نفهم احتياجات المستخدم",
    text: "نبدأ من الأسئلة والاحتياجات اليومية للمستخدم، وننظر إلى التفاصيل التي تجعل رحلته داخل المنصة أسهل وأكثر وضوحًا.",
  },
  {
    number: "02",
    title: "نعمل بروح واحدة",
    text: "نتعامل مع تطوير المنصة باعتباره عملًا جماعيًا؛ تتكامل فيه الأفكار والتخصصات للوصول إلى تجربة مترابطة بدلًا من حلول متفرقة.",
  },
  {
    number: "03",
    title: "نراجع ونطوّر باستمرار",
    text: "لا نتعامل مع التطوير باعتباره خطوة تنتهي، بل عملية مستمرة لمراجعة التفاصيل وتحسين سهولة الاستخدام ومواكبة تطلعات المستخدمين.",
  },
];

export default function TeamPage() {
  return (
    <>
      <Navbar />
      <main dir="rtl" className="relative min-h-screen overflow-hidden bg-[#191c1f] px-4 pb-20 pt-12 text-white sm:px-6 lg:px-8">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -right-24 top-20 h-80 w-80 rounded-full bg-[#00afaa]/10 blur-[110px]" />
          <div className="absolute -left-24 top-[520px] h-96 w-96 rounded-full bg-[#81d8d0]/[0.07] blur-[120px]" />
          <div className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "linear-gradient(rgba(129,216,208,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(129,216,208,.12) 1px, transparent 1px)", backgroundSize: "64px 64px" }} />
        </div>

        <div className="relative mx-auto max-w-7xl">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#00afaa]/25 bg-[#00afaa]/[0.08] px-4 py-2 text-xs font-bold text-[#81d8d0]">
              <Users2 size={15} />
              تعرف على EQUITI
            </div>
            <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:border-[#00afaa]/40 hover:text-white">
              العودة للرئيسية <ArrowLeft size={16} />
            </Link>
          </div>

          <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[#24282b] p-7 shadow-2xl shadow-black/20 sm:p-10 lg:p-14">
            <div className="relative z-10 grid items-center gap-10 lg:grid-cols-[1.05fr_.95fr]">
              <div>
                <p className="text-xs font-black tracking-[.18em] text-[#81d8d0]">EQUITI TRADE HUB · OUR PEOPLE</p>
                <h1 className="mt-5 text-4xl font-black leading-[1.2] sm:text-5xl lg:text-6xl">
                  فريق العمل
                  <span className="mt-2 block bg-gradient-to-l from-[#81d8d0] to-[#00afaa] bg-clip-text text-transparent">خبرات تصنع الفرق</span>
                </h1>
                <p className="mt-7 max-w-2xl text-base leading-9 text-white/65 sm:text-lg">
                  وراء كل تجربة مميزة عمل متواصل يجمع بين المعرفة، والابتكار، والاهتمام بالتفاصيل. في EQUITI نؤمن أن نجاح المنصة لا يعتمد على أداة واحدة، بل على تكامل الجهود من الفكرة الأولى وحتى وصول الخدمة إلى المستخدم.
                </p>
                <p className="mt-4 max-w-2xl text-sm leading-8 text-white/50 sm:text-base">
                  نعمل على جعل متابعة الأسواق والتعامل مع الأدوات المالية تجربة أكثر تنظيمًا وسهولة. ونضع احتياجات المستخدم في مقدمة اهتمامنا، حتى تكون كل خطوة داخل المنصة مفهومة ومترابطة مع ما قبلها وما بعدها.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <a href="#our-team" className="rounded-xl bg-[#00afaa] px-6 py-3 text-sm font-extrabold text-[#101719] transition hover:-translate-y-0.5 hover:bg-[#81d8d0]">تعرّف على فريقنا</a>
                  <Link href="/contact" className="rounded-xl border border-white/15 px-6 py-3 text-sm font-bold text-white transition hover:border-[#00afaa]/50 hover:bg-white/[0.04]">تواصل معنا</Link>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="relative mt-8 aspect-[4/5] overflow-hidden rounded-[24px] border border-white/10">
                  <Image src={teamImages[0].src} alt={teamImages[0].alt} fill priority sizes="(max-width: 768px) 45vw, 260px" className="object-cover" />
                </div>
                <div className="relative aspect-[4/5] overflow-hidden rounded-[24px] border border-white/10">
                  <Image src={teamImages[1].src} alt={teamImages[1].alt} fill priority sizes="(max-width: 768px) 45vw, 260px" className="object-cover" />
                </div>
              </div>
            </div>
          </section>

          <section className="py-20">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-black tracking-[.2em] text-[#81d8d0]">WHO WE ARE</p>
              <h2 className="mt-4 text-3xl font-black sm:text-4xl">فريق يجمع الخبرة والطموح</h2>
              <p className="mt-5 text-sm leading-8 text-white/60 sm:text-base">
                نرى أن التجربة الجيدة تبدأ من فهم الصورة كاملة؛ من طريقة عرض البيانات، إلى سهولة التنقل بين الأقسام، وحتى وضوح الخطوات التي يحتاج إليها المستخدم. لهذا نهتم بالتفاصيل الصغيرة بقدر اهتمامنا بالصورة العامة.
              </p>
              <p className="mt-4 text-sm leading-8 text-white/45 sm:text-base">
                يجمعنا هدف واحد: بناء منصة متناسقة تتطور مع الوقت، وتمنح المستخدم مساحة أوضح لمتابعة السوق والتعرّف على الأدوات المتاحة، من خلال تجربة رقمية تهتم بالبساطة والتنظيم.
              </p>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {pillars.map(({ icon: Icon, title, text }) => (
                <article key={title} className="rounded-[24px] border border-white/[0.08] bg-[#24282b] p-6 transition duration-300 hover:-translate-y-1 hover:border-[#00afaa]/35 hover:shadow-xl hover:shadow-black/20">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#00afaa]/20 bg-[#00afaa]/10 text-[#81d8d0]"><Icon size={23} /></div>
                  <h3 className="mt-6 text-lg font-extrabold">{title}</h3>
                  <p className="mt-3 text-sm leading-8 text-white/55">{text}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="py-8">
            <div className="mb-10 max-w-3xl">
              <p className="text-xs font-black tracking-[.2em] text-[#81d8d0]">HOW WE WORK</p>
              <h2 className="mt-4 text-3xl font-black sm:text-4xl">من الفكرة إلى تجربة متكاملة</h2>
              <p className="mt-5 text-sm leading-8 text-white/55 sm:text-base">
                لكل تفصيل داخل المنصة سبب وهدف. لذلك نعتمد في عملنا على فهم ما يحتاج إليه المستخدم، والتعاون في تنفيذ الأفكار، ثم مراجعة النتيجة وتحسينها. هذه الخطوات تساعدنا على الحفاظ على تجربة متناسقة بدلًا من إضافة مزايا لا ترتبط ببعضها.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {workSteps.map((step) => (
                <article key={step.number} className="rounded-[24px] border border-white/[0.08] bg-white/[0.025] p-7">
                  <span className="text-sm font-black tracking-[.2em] text-[#81d8d0]">{step.number}</span>
                  <h3 className="mt-5 text-xl font-extrabold">{step.title}</h3>
                  <p className="mt-4 text-sm leading-8 text-white/55">{step.text}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="our-team" className="scroll-mt-28 pt-16">
            <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black tracking-[.2em] text-[#81d8d0]">OUR TEAM</p>
                <h2 className="mt-3 text-3xl font-black sm:text-4xl">معًا نحو تجربة أفضل</h2>
                <p className="mt-4 max-w-2xl text-sm leading-8 text-white/55">
                  العمل الجماعي هو ما يحوّل الأفكار إلى تجربة يمكن للمستخدم التعامل معها كل يوم. وتعبّر هذه الصور عن جانب من روح التعاون التي نعتز بها، وعن الأشخاص والجهود التي تقف خلف تطوير المنصة.
                </p>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {teamImages.map((item, index) => (
                <figure key={item.src} className="group relative aspect-[4/5] overflow-hidden rounded-[26px] border border-white/10 bg-[#24282b]">
                  <Image src={item.src} alt={item.alt} fill sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 280px" className="object-cover transition duration-700 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#101719]/90 via-transparent to-transparent" />
                  <figcaption className="absolute inset-x-0 bottom-0 p-5">
                    <span className="text-[10px] font-bold tracking-[.18em] text-[#81d8d0]">EQUITI · {String(index + 1).padStart(2, "0")}</span>
                    <h3 className="mt-2 text-lg font-extrabold text-white">روح الفريق والعمل المشترك</h3>
                    <p className="mt-2 text-xs leading-6 text-white/65">جهود متكاملة واهتمام بالتفاصيل لصناعة تجربة أفضل.</p>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>

          <section className="mt-20 overflow-hidden rounded-[28px] border border-[#00afaa]/20 bg-gradient-to-l from-[#00afaa]/15 via-[#24282b] to-[#24282b] p-8 sm:p-12">
            <div className="max-w-3xl">
              <p className="text-xs font-black tracking-[.2em] text-[#81d8d0]">LET'S CONNECT</p>
              <h2 className="mt-4 text-3xl font-black sm:text-4xl">هل ترغب في التواصل معنا؟</h2>
              <p className="mt-4 text-sm leading-8 text-white/60">
                نؤمن أن التواصل الجيد يبدأ بالاستماع. إذا كان لديك سؤال أو استفسار أو ترغب في معرفة المزيد عن المنصة وخدماتها، يمكنك التواصل معنا، وسنسعد بمساعدتك وتوجيهك إلى المعلومات المناسبة.
              </p>
              <Link href="/contact" className="mt-7 inline-flex items-center gap-3 rounded-xl bg-[#00afaa] px-6 py-3.5 text-sm font-extrabold text-[#101719] transition hover:bg-[#81d8d0]">تواصل مع فريقنا <ArrowLeft size={17} /></Link>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
