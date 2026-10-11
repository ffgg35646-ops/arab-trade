
"use client";

import {
  ReactNode,
  useEffect,
  useState,
} from "react";
import {
  usePathname,
  useRouter,
} from "next/navigation";

export default function AdminGuard({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [state, setState] =
    useState<
      "loading" |
      "allowed" |
      "denied"
    >("loading");

  useEffect(() => {
    let active = true;

    async function check() {
      try {
        const controller =
          new AbortController();

        const timeout =
          window.setTimeout(
            () => controller.abort(),
            8000
          );

        const response =
          await fetch(
            "/api/admin/me",
            {
              method: "GET",
              credentials: "include",
              cache: "no-store",
              signal:
                controller.signal,
            }
          );

        window.clearTimeout(timeout);

        if (!response.ok) {
          if (!active) return;

          setState("denied");

          router.replace(
            `/admin/login?next=${encodeURIComponent(
              pathname || "/admin"
            )}`
          );

          return;
        }

        const data =
          await response.json();

        const role =
          data?.admin?.role;

        if (
          !data?.authenticated ||
          ![
            "admin",
            "admin_leader",
          ].includes(role)
        ) {
          if (!active) return;

          setState("denied");

          router.replace(
            `/admin/login?next=${encodeURIComponent(
              pathname || "/admin"
            )}`
          );

          return;
        }

        if (active) {
          setState("allowed");
        }
      } catch {
        if (!active) return;

        setState("denied");

        router.replace(
          `/admin/login?next=${encodeURIComponent(
            pathname || "/admin"
          )}`
        );
      }
    }

    check();

    return () => {
      active = false;
    };
  }, [pathname, router]);

  if (state === "loading") {
    return (
      <main
        dir="rtl"
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#050a13",
          color: "#fff",
        }}
      >
        جاري التحقق من صلاحيات الإدارة...
      </main>
    );
  }

  if (state === "denied") {
    return null;
  }

  return <>{children}</>;
}