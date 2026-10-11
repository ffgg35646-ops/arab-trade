import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  BarChart3,
  Bell,
  BadgeCheck,
  CalendarDays,
  ChevronLeft,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  FileText,
  Gift,
  KeyRound,
  LockKeyhole,
  Search,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";

type Action = {
  label: string;
  href: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  primary?: boolean;
};

type Info = {
  label: string;
  value?: string;
  muted?: string;
};

export function DashboardShell({
  title,
  description,
  icon: Icon = Wallet,
  actions = [],
  children,
}: {
  title: string;
  description: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  actions?: Action[];
  children: React.ReactNode;
}) {
  return (
    <main dir="rtl" className="min-h-screen bg-[#050a13] text-white">
      <div className="mx-auto max-w-[1700px]">
        <div className="border-b border-white/10 bg-[#07101d] px-4 py-5 md:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10">
                <Icon size={22} className="text-cyan-300" />
              </div>
              <div>
                <h1 className="text-xl font-bold">{title}</h1>
                <p className="mt-1 text-xs leading-6 text-slate-500">
                  {description}
                </p>
              </div>
            </div>

            {actions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {actions.map((action) => {
                  const ActionIcon = action.icon;
                  return (
                    <Link
                      key={action.href}
                      href={action.href}
                      className={`flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold transition ${
                        action.primary
                          ? "bg-blue-500 text-white hover:bg-blue-400"
                          : "border border-white/10 text-slate-300 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      {ActionIcon && <ActionIcon size={15} />}
                      {action.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 md:p-6 lg:p-8">{children}</div>
      </div>
    </main>
  );
}

export function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#07101d]">
      <div className="border-b border-white/10 px-5 py-4">
        <h2 className="text-sm font-bold">{title}</h2>
        {description && (
          <p className="mt-1 text-xs leading-6 text-slate-500">{description}</p>
        )}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function EmptyState({
  icon: Icon = FileText,
  title,
  description,
  href,
  action,
}: {
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
  href?: string;
  action?: string;
}) {
  const content = (
    <>
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.025]">
        <Icon size={23} className="text-slate-500" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-slate-300">{title}</h3>
      <p className="mx-auto mt-2 max-w-lg text-xs leading-6 text-slate-600">
        {description}
      </p>
      {action && href && (
        <span className="mt-5 inline-flex rounded-xl border border-white/10 px-4 py-2.5 text-xs font-semibold text-cyan-300 hover:bg-white/5">
          {action}
        </span>
      )}
    </>
  );

  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-5 py-14 text-center">
      {href ? <Link href={href}>{content}</Link> : content}
    </div>
  );
}

export function MetricGrid({ items }: { items: Info[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-white/5 bg-white/[0.02] p-4"
        >
          <div className="text-[11px] text-slate-500">{item.label}</div>
          <div className="mt-2 font-mono text-sm text-slate-300">
            {item.value ?? "--"}
          </div>
          {item.muted && (
            <div className="mt-1 text-[10px] text-slate-600">{item.muted}</div>
          )}
        </div>
      ))}
    </div>
  );
}

export function FilterBar({ placeholder = "بحث..." }: { placeholder?: string }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="relative w-full md:max-w-sm">
        <Search
          size={16}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600"
        />
        <input
          type="text"
          placeholder={placeholder}
          className="w-full rounded-xl border border-white/10 bg-[#050a13] py-3 pr-9 pl-3 text-xs text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/40"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {["الكل", "حديث", "مكتمل", "قيد المعالجة"].map((item, index) => (
          <button
            type="button"
            key={item}
            className={`whitespace-nowrap rounded-xl px-3 py-2.5 text-xs ${
              index === 0
                ? "bg-blue-500/15 text-cyan-300"
                : "border border-white/10 text-slate-500 hover:bg-white/5"
            }`}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}