"use client";

import { apiFetch } from "@/lib/frontend-api";
import { Bell, CheckCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type NotificationItem = {
  _id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string | null;
};

type NotificationsResponse = {
  success: boolean;
  message?: string;
  notifications?: NotificationItem[];
  unreadCount?: number;
};

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const response = await fetch("/api/notifications", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data?.success !== true) {
        throw new Error(
          data?.message || "تعذر تحميل الإشعارات"
        );
      }

      const notifications = Array.isArray(data.notifications)
        ? data.notifications
        : [];

      setItems(notifications);
      setUnreadCount(Number(data.unreadCount || 0));
      setError("");
    } catch (error) {
      console.error("USER NOTIFICATIONS ERROR:", error);

      setError(
        error instanceof Error
          ? error.message
          : "تعذر تحميل الإشعارات"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();

    const timer = window.setInterval(() => {
      void load();
    }, 15000);

    return () => window.clearInterval(timer);
  }, []);

  async function mark(id?: string) {
    try {
      const data = await apiFetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          id ? { id } : {}
        ),
      });

      if (!data?.success) {
        throw new Error(
          data?.message || "تعذر تحديث حالة الإشعار"
        );
      }

      await load();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "تعذر تحديث الإشعار"
      );
    }
  }

  async function openNotification(item: NotificationItem) {
    await mark(item._id);

    if (item.type === "reward") {
      router.push("/dashboard/rewards");
    }
  }

  return (
    <>
      

      <div className="mx-auto flex max-w-[1700px]">
        

        <main
          dir="rtl"
          className="min-w-0 flex-1 bg-[#050a13] text-white"
        >
          <div className="mx-auto w-full max-w-4xl p-4 md:p-6 lg:p-8">
            <section className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#07101d] to-[#0b1628]">
              <div className="flex items-center justify-between border-b border-white/10 p-5">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Bell
                      size={22}
                      className="text-cyan-300"
                    />

                    {unreadCount > 0 ? (
                      <span className="absolute -right-3 -top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-black">
                        {unreadCount > 99
                          ? "99+"
                          : unreadCount}
                      </span>
                    ) : null}
                  </div>

                  <div>
                    <h1 className="text-xl font-extrabold">
                      الإشعارات
                    </h1>

                    <p className="mt-1 text-xs text-slate-400">
                      لديك {unreadCount} إشعار غير مقروء.
                    </p>
                  </div>
                </div>

                {items.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => void mark()}
                    className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-xs text-slate-300 hover:bg-white/5"
                  >
                    <CheckCheck size={14} />
                    قراءة الكل
                  </button>
                ) : null}
              </div>

              {loading ? (
                <div className="px-5 py-16 text-center text-xs text-slate-500">
                  جاري تحميل الإشعارات...
                </div>
              ) : error ? (
                <div className="px-5 py-16 text-center text-xs text-red-300">
                  {error}
                </div>
              ) : items.length === 0 ? (
                <div className="px-5 py-16 text-center text-xs text-slate-600">
                  لا توجد إشعارات.
                </div>
              ) : (
                <div>
                  {items.map((item) => (
                    <button
                      type="button"
                      key={item._id}
                      onClick={() => void openNotification(item)}
                      className={`flex w-full items-start gap-4 border-b border-white/5 p-6 text-right transition hover:bg-cyan-400/[0.04] ${
                        item.read ? "opacity-60" : ""
                      }`}
                    >
                      <div
                        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                          item.read
                            ? "bg-slate-700"
                            : "bg-cyan-400"
                        }`}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">
                          {item.title}
                        </div>

                        <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-300">
                          {item.message}
                        </div>

                        <div className="mt-3 text-xs text-slate-500">
                          {item.type}
                          {item.createdAt
                            ? ` · ${new Date(
                                item.createdAt
                              ).toLocaleString("ar-EG")}`
                            : ""}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </>
  );
}