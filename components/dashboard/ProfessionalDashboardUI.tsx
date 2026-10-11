import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Bell,
  ChevronLeft,
  CircleHelp,
  FileText,
  Search,
  Wallet,
} from "lucide-react";

export function PageFrame({
  title,
  description,
  icon: Icon,
  actions = [],
  children,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  actions?: { label: string; href: string; icon?: LucideIcon; primary?: boolean }[];
  children: ReactNode;
}) {
  return (
    <main dir="rtl" className="min-h-screen bg-[#050a13] text-white">
      <div className="mx-auto max-w-[1700px]">
        <div className="border-b border-white/10 bg-[#07101d]">
          <div className="flex flex-col gap-5 px-4 py-6 md:px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-400/10">
                  <Icon size={22} className="text-cyan-300" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-bold tracking-tight">{title}</h1>
                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] text-slate-500">
                      مساحة الحساب
                    </span>
                  </div>
                  <p className="mt-1 max-w-3xl text-xs leading-6 text-slate-500">
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
                        className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-bold transition ${
                          action.primary
                            ? "bg-blue-500 text-white hover:bg-blue-400"
                            : "border border-white/10 bg-white/[0.02] text-slate-300 hover:bg-white/[0.05] hover:text-white"
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
        </div>

        <div className="p-4 md:p-6 lg:p-8">{children}</div>
      </div>
    </main>
  );
}

export function Stats({
  items,
}: {
  items: { label: string; value?: string; note?: string }[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-2xl border border-white/10 bg-[#07101d] p-5"
        >
          <div className="text-[11px] text-slate-500">{item.label}</div>
          <div className="mt-3 font-mono text-xl font-semibold text-slate-200">
            {item.value ?? "—"}
          </div>
          {item.note && (
            <div className="mt-2 text-[10px] leading-5 text-slate-600">
              {item.note}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function Panel({
  title,
  description,
  right,
  children,
}: {
  title: string;
  description?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#07101d]">
      <div className="flex flex-col justify-between gap-3 border-b border-white/10 px-5 py-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-sm font-bold text-slate-100">{title}</h2>
          {description && (
            <p className="mt-1 text-[11px] leading-5 text-slate-600">
              {description}
            </p>
          )}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Tabs({
  items,
  active = 0,
}: {
  items: string[];
  active?: number;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-white/10 px-4">
      {items.map((item, index) => (
        <button
          key={item}
          type="button"
          className={`whitespace-nowrap border-b-2 px-4 py-3 text-xs transition ${
            index === active
              ? "border-cyan-400 text-cyan-300"
              : "border-transparent text-slate-500 hover:text-slate-300"
          }`}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

export function Toolbar({
  placeholder = "بحث...",
  filters = ["الكل", "الأحدث", "المكتمل", "قيد المعالجة"],
}: {
  placeholder?: string;
  filters?: string[];
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-white/10 p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="relative w-full max-w-md">
        <Search
          size={15}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600"
        />
        <input
          className="w-full rounded-xl border border-white/10 bg-[#050a13] py-3 pr-9 pl-3 text-xs text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/30"
          placeholder={placeholder}
        />
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {filters.map((filter, i) => (
          <button
            key={filter}
            type="button"
            className={`whitespace-nowrap rounded-xl px-3 py-2.5 text-xs ${
              i === 0
                ? "bg-blue-500/15 text-cyan-300"
                : "border border-white/10 text-slate-500 hover:bg-white/5 hover:text-slate-300"
            }`}
          >
            {filter}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Table({
  columns,
  empty,
}: {
  columns: string[];
  empty: string;
}) {
  return (
    <div className="overflow-x-auto">
      <div
        className="min-w-[760px]"
        style={{ display: "grid", gridTemplateColumns: `repeat(${columns.length}, minmax(0,1fr))` }}
      >
        {columns.map((column) => (
          <div
            key={column}
            className="border-b border-white/5 px-5 py-3 text-[10px] text-slate-600"
          >
            {column}
          </div>
        ))}
      </div>

      <div className="px-5 py-16 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02]">
          <FileText size={19} className="text-slate-600" />
        </div>
        <div className="mt-4 text-xs font-semibold text-slate-400">{empty}</div>
        <div className="mx-auto mt-2 max-w-md text-[10px] leading-5 text-slate-600">
          لا توجد بيانات فعلية محملة لهذا القسم حاليًا.
        </div>
      </div>
    </div>
  );
}

export function Empty({
  icon: Icon = CircleHelp,
  title,
  description,
  href,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  href?: string;
  action?: string;
}) {
  const body = (
    <>
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02]">
        <Icon size={22} className="text-slate-500" />
      </div>
      <div className="mt-4 text-sm font-semibold text-slate-300">{title}</div>
      <div className="mx-auto mt-2 max-w-xl text-xs leading-6 text-slate-600">
        {description}
      </div>
      {action && href && (
        <span className="mt-5 inline-flex rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5 text-xs font-semibold text-cyan-300">
          {action}
        </span>
      )}
    </>
  );

  return (
    <div className="px-5 py-16 text-center">
      {href ? <Link href={href}>{body}</Link> : body}
    </div>
  );
}

export function Notice({
  children,
  icon: Icon = Bell,
}: {
  children: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-blue-400/10 bg-blue-500/[0.06] p-4">
      <Icon size={18} className="mt-0.5 shrink-0 text-cyan-300" />
      <div className="text-xs leading-6 text-slate-400">{children}</div>
    </div>
  );
}

export const actionIcons = {
  deposit: ArrowDownToLine,
  withdraw: ArrowUpFromLine,
  transfer: ArrowLeftRight,
  wallet: Wallet,
  help: CircleHelp,
  file: FileText,
};