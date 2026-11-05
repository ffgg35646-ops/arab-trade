
"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function AdminLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const next =
    searchParams.get("next") || "/admin";

  const [identifier, setIdentifier] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  async function submit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setLoading(true);
    setError("");

    try {
      const loginResponse = await fetch(
        "/api/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({
            identifier,
            password,
          }),
        }
      );

      const loginData =
        await loginResponse.json()
          .catch(() => ({}));

      if (!loginResponse.ok) {
        throw new Error(
          loginData?.error ||
          "بيانات تسجيل الدخول غير صحيحة"
        );
      }

      const adminResponse =
        await fetch(
          "/api/admin/me",
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          }
        );

      const adminData =
        await adminResponse.json()
          .catch(() => ({}));

      if (
        !adminResponse.ok ||
        !adminData?.authenticated ||
        !adminData?.admin ||
        ![
          "admin",
          "admin_leader",
        ].includes(
          adminData.admin.role
        )
      ) {
        await fetch(
          "/api/auth/logout",
          {
            method: "POST",
            credentials: "include",
          }
        );

        throw new Error(
          "هذا الحساب لا يملك صلاحية الدخول إلى لوحة الإدارة"
        );
      }

      router.replace(next);
      router.refresh();
    } catch (err: any) {
      setError(
        err?.message ||
        "حدث خطأ أثناء تسجيل الدخول"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      dir="rtl"
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 14% 0%, rgba(0,175,170,.10), transparent 34rem), radial-gradient(circle at 92% 82%, rgba(129,216,208,.055), transparent 36rem), #191c1f",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        color: "#fff",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 440,
          background:
            "rgba(48,56,59,.68)",
          backgroundImage:
            "linear-gradient(135deg,rgba(255,255,255,.055),rgba(255,255,255,.012))",
          border:
            "1px solid rgba(255,255,255,.14)",
          borderRadius: 22,
          padding: 30,
          boxShadow:
            "0 24px 60px rgba(0,0,0,.24), inset 0 1px 0 rgba(255,255,255,.05)",
          backdropFilter:
            "blur(40px) saturate(145%)",
        }}
      >
        <div
          style={{
            textAlign: "center",
            marginBottom: 28,
          }}
        >
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: 16,
              margin: "0 auto 14px",
              display: "grid",
              placeItems: "center",
              background:
                "linear-gradient(145deg,rgba(129,216,208,.18),rgba(0,111,107,.12))",
              fontWeight: 900,
              border: "1px solid rgba(129,216,208,.22)",
              color: "#c4e5e1",
              fontSize: 21,
            }}
          >
            AT
          </div>

          <div
            style={{
              fontSize: 12,
              opacity: 0.55,
              marginBottom: 7,
            }}
          >
            EQUITI
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 900,
            }}
          >
            دخول الإدارة
          </h1>

          <p
            style={{
              margin:
                "10px 0 0",
              color:
                "rgba(255,255,255,.58)",
              fontSize: 13,
              lineHeight: 1.7,
            }}
          >
            قم بتسجيل الدخول بحساب
            الإدارة للوصول إلى مركز
            التحكم.
          </p>
        </div>

        <form onSubmit={submit}>
          <label
            style={{
              display: "block",
              marginBottom: 8,
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            البريد الإلكتروني أو اسم المستخدم
          </label>

          <input
            value={identifier}
            onChange={(e) =>
              setIdentifier(
                e.target.value
              )
            }
            autoComplete="username"
            required
            placeholder="أدخل بيانات الدخول"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding:
                "14px 15px",
              marginBottom: 18,
              borderRadius: 12,
              border:
                "1px solid rgba(255,255,255,.10)",
              background:
                "rgba(5,10,19,.66)",
              color: "#fff",
              outline: "none",
              fontSize: 14,
            }}
          />

          <label
            style={{
              display: "block",
              marginBottom: 8,
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            كلمة المرور
          </label>

          <input
            type="password"
            value={password}
            onChange={(e) =>
              setPassword(
                e.target.value
              )
            }
            autoComplete="current-password"
            required
            placeholder="أدخل كلمة المرور"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding:
                "14px 15px",
              marginBottom: 16,
              borderRadius: 12,
              border:
                "1px solid rgba(255,255,255,.10)",
              background:
                "rgba(5,10,19,.66)",
              color: "#fff",
              outline: "none",
              fontSize: 14,
            }}
          />

          {error && (
            <div
              style={{
                marginBottom: 16,
                padding: 12,
                borderRadius: 10,
                background:
                  "rgba(239,68,68,.10)",
                border:
                  "1px solid rgba(239,68,68,.25)",
                color: "#ff9b9b",
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              border: 0,
              borderRadius: 12,
              padding:
                "14px 16px",
              background:
                "linear-gradient(135deg,#007d77,#00615d)",
              color: "#fff",
              fontWeight: 900,
              fontSize: 14,
              cursor: loading
                ? "not-allowed"
                : "pointer",
              opacity: loading
                ? 0.7
                : 1,
            }}
          >
            {loading
              ? "جارٍ التحقق..."
              : "دخول لوحة الإدارة"}
          </button>
        </form>

        <div
          style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop:
              "1px solid rgba(255,255,255,.07)",
            textAlign: "center",
          }}
        >
          <Link
            href="/login"
            style={{
              fontSize: 12,
              color:
                "#a9c4c1",
              textDecoration: "none",
            }}
          >
            العودة إلى دخول المستخدم
          </Link>
        </div>
      </section>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginContent />
    </Suspense>
  );
}
