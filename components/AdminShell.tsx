"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Counts = {
  withdrawals: number;
  deposits: number;
  kyc: number;
  total: number;
};

const groups = [
  {
    title: "الرئيسية",
    items: [{ label: "لوحة التحكم", href: "/admin" }],
  },
  {
    title: "المستخدمون",
    items: [
      { label: "المستخدمون", href: "/admin/users" },
      { label: "التحقق KYC", href: "/admin/kyc" },
    ],
  },
  {
    title: "العمليات المالية",
    items: [
      { label: "الإيداعات", href: "/admin/deposits" },
      { label: "السحوبات", href: "/admin/withdrawals" },
      { label: "الباقات", href: "/admin/packages" },
      { label: "وسائل الدفع", href: "/admin/payments" },
      { label: "الأصول والشبكات", href: "/admin/assets" },
    ],
  },
  {
    title: "النظام",
    items: [
      { label: "المكافآت", href: "/admin/rewards" },
      { label: "الإحالة", href: "/admin/referral" },
      { label: "الإشعارات", href: "/admin/notifications" },
      { label: "الدعم", href: "/admin/support" },
    ],
  },
];

export default function AdminShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [counts, setCounts] = useState<Counts>({
    withdrawals: 0,
    deposits: 0,
    kyc: 0,
    total: 0,
  });

  const loadCounts = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/notifications-summary", {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) return;

      const json = await response.json();

      if (json?.success && json?.counts) {
        setCounts({
          withdrawals: Number(json.counts.withdrawals || 0),
          deposits: Number(json.counts.deposits || 0),
          kyc: Number(json.counts.kyc || 0),
          total: Number(json.counts.total || 0),
        });
      }
    } catch {
      // إبقاء آخر أرقام ناجحة بدل كسر واجهة الأدمن.
    }
  }, []);

  useEffect(() => {
    void loadCounts();

    const timer = window.setInterval(() => {
      void loadCounts();
    }, 3000);

    return () => window.clearInterval(timer);
  }, [loadCounts]);

  useEffect(() => {
    setNotificationOpen(false);
  }, [pathname]);

  async function logout() {
    setBusy(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      router.replace("/admin/login");
      setBusy(false);
    }
  }

  const notificationItems = [
    {
      title: "طلبات السحب",
      count: counts.withdrawals,
      href: "/admin/withdrawals",
    },
    {
      title: "طلبات الإيداع",
      count: counts.deposits,
      href: "/admin/deposits",
    },
    {
      title: "طلبات التوثيق",
      count: counts.kyc,
      href: "/admin/kyc",
    },
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-[#050a13] text-white">
      <aside className="fixed right-0 top-0 z-40 hidden h-screen w-[280px] overflow-y-auto border-l border-slate-800 bg-[#07101d] lg:block">
        <div className="border-b border-slate-800 p-5">
          <div className="text-xl font-black">ArabTrade</div>
          <div className="mt-1 text-xs text-slate-500">لوحة الإدارة</div>
        </div>

        <nav className="space-y-5 p-4">
          {groups.map((group) => (
            <div key={group.title}>
              <div className="mb-2 px-3 text-[11px] font-bold text-slate-500">
                {group.title}
              </div>

              <div className="space-y-1">
                {group.items.map((item) => {
                  const active =
                    pathname === item.href ||
                    (item.href !== "/admin" &&
                      pathname.startsWith(item.href + "/"));

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block rounded-xl px-3 py-3 text-sm font-bold transition ${
                        active
                          ? "bg-blue-600/20 text-blue-300"
                          : "text-slate-300 hover:bg-white/[0.04] hover:text-white"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          <button
            onClick={logout}
            disabled={busy}
            className="w-full rounded-xl border border-red-900/60 bg-red-950/20 px-3 py-3 text-sm font-bold text-red-300 hover:bg-red-950/40 disabled:opacity-50"
          >
            {busy ? "جاري تسجيل الخروج..." : "تسجيل الخروج"}
          </button>
        </nav>
      </aside>

      <main className="lg:mr-[280px]">
        <div className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#050a13]/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              {pathname !== "/admin" ? (
                <Link
                  href="/admin"
                  className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-700 bg-[#0b1422] px-3 py-2 text-sm font-bold text-slate-300 hover:bg-[#101c2d] hover:text-white"
                >
                  <span className="text-lg">←</span>
                  <span>الرئيسية</span>
                </Link>
              ) : null}

              {title ? (
                <h1 className="truncate text-lg font-black sm:text-xl">
                  {title}
                </h1>
              ) : null}
            </div>

            <div className="relative shrink-0">
              <button
                onClick={() => setNotificationOpen((v) => !v)}
                className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-[#0b1422] text-lg hover:bg-[#101c2d]"
                aria-label="إشعارات الطلبات"
              >
                🔔

                {counts.total > 0 ? (
                  <span className="absolute -right-1 -top-1 flex min-h-[20px] min-w-[20px] items-center justify-center rounded-full border-2 border-[#050a13] bg-red-600 px-1 text-[10px] font-black text-white">
                    {counts.total.toLocaleString("en-US")}
                  </span>
                ) : null}
              </button>

              {notificationOpen ? (
                <div className="absolute left-0 top-14 w-[300px] overflow-hidden rounded-2xl border border-slate-700 bg-[#08111e] shadow-2xl">
                  <div className="border-b border-slate-800 px-4 py-4">
                    <div className="font-black">طلبات جديدة</div>
                    <div className="mt-1 text-xs text-slate-500">
                      العدد يتغير تلقائيًا حسب الطلبات المعلقة
                    </div>
                  </div>

                  <div className="p-2">
                    {notificationItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center justify-between rounded-xl px-3 py-3 hover:bg-white/[0.04]"
                      >
                        <span className="font-bold text-slate-200">
                          {item.title}
                        </span>

                        {item.count > 0 ? (
                          <span className="flex min-w-[28px] items-center justify-center rounded-full bg-red-600 px-2 py-1 text-xs font-black text-white">
                            {item.count.toLocaleString("en-US")}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600">0</span>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6">{children}</div>
      </main>
    </div>
  );
}