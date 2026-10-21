"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const ADMIN_ACCESS_CACHE_MS = 30_000;
let adminAccessValidUntil = 0;
let adminAccessCacheVersion = 0;
let pendingAdminAccessCheck: Promise<boolean> | null = null;

/** Clear the short-lived UI cache when the administrator signs out. */
export function invalidateAdminGuardCache() {
  adminAccessCacheVersion += 1;
  adminAccessValidUntil = 0;
  pendingAdminAccessCheck = null;
}

async function verifyAdminAccess(): Promise<boolean> {
  if (Date.now() < adminAccessValidUntil) return true;
  if (pendingAdminAccessCheck) return pendingAdminAccessCheck;

  const requestVersion = adminAccessCacheVersion;
  const request = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch("/api/admin/me", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) return false;

      const data = await response.json();
      const role = data?.admin?.role;
      const allowed = Boolean(
        data?.authenticated && ["admin", "admin_leader"].includes(role)
      );

      // Ignore an old request if logout/session change invalidated the cache.
      if (requestVersion !== adminAccessCacheVersion) return false;

      if (allowed) {
        adminAccessValidUntil = Date.now() + ADMIN_ACCESS_CACHE_MS;
      }

      return allowed;
    } catch {
      return false;
    } finally {
      window.clearTimeout(timeout);
    }
  })();

  pendingAdminAccessCheck = request;

  try {
    return await request;
  } finally {
    if (pendingAdminAccessCheck === request) {
      pendingAdminAccessCheck = null;
    }
  }
}

export default function AdminGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");

  useEffect(() => {
    let active = true;

    void verifyAdminAccess().then((allowed) => {
      if (!active) return;

      if (!allowed) {
        setState("denied");
        router.replace(
          `/admin/login?next=${encodeURIComponent(pathname || "/admin")}`
        );
        return;
      }

      setState("allowed");
    });

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
        role="status"
        aria-live="polite"
      >
        جاري التحقق من صلاحيات الإدارة...
      </main>
    );
  }

  if (state === "denied") return null;

  return <>{children}</>;
}
