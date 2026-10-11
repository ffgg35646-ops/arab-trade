"use client";

import { useEffect, useState } from "react";

export default function GlobalSuccessToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    const shouldShow = (url: string, method: string) => {
      const upper = method.toUpperCase();

      // نعرضه لعمليات الحفظ/التعديل فقط
      if (!["POST", "PATCH", "PUT"].includes(upper)) {
        return false;
      }

      // لا نعتبر تسجيل الدخول/الخروج حفظًا
      if (url.includes("/api/auth/")) {
        return false;
      }

      // فتح/استلام مكافأة ليس "حفظ تغييرات"
      if (url === "/api/rewards" && upper === "POST") {
        return false;
      }

      // إرسال إشعار ليس حفظ إعدادات
      if (
        url === "/api/admin/notifications" &&
        upper === "POST"
      ) {
        return false;
      }

      return true;
    };

    const patchedFetch: typeof window.fetch = async (
      input,
      init
    ) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      const method =
        init?.method ||
        (input instanceof Request
          ? input.method
          : "GET");

      const response = await originalFetch(
        input,
        init
      );

      if (
        response.ok &&
        shouldShow(url, method)
      ) {
        try {
          const clone = response.clone();
          const data = await clone.json();

          if (data?.success === true) {
            window.dispatchEvent(
              new CustomEvent(
                "arabtrade:save-success"
              )
            );
          }
        } catch {
          // بعض الاستجابات لا تكون JSON.
        }
      }

      return response;
    };

    window.fetch = patchedFetch;

    const show = () => {
      setVisible(true);

      window.setTimeout(() => {
        setVisible(false);
      }, 2500);
    };

    window.addEventListener(
      "arabtrade:save-success",
      show
    );

    return () => {
      window.fetch = originalFetch;
      window.removeEventListener(
        "arabtrade:save-success",
        show
      );
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      dir="rtl"
      className="fixed bottom-6 left-1/2 z-[9999] -translate-x-1/2"
    >
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-[#07101d] px-5 py-3 text-sm font-black text-emerald-300 shadow-2xl">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15">
          ✓
        </span>

        <span>تم الحفظ بنجاح</span>
      </div>
    </div>
  );
}