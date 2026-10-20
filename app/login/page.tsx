"use client";

import Link from "next/link";
import { ArrowRight, Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";

export default function LoginPage() {
  const router = useRouter();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified") === "1") {
      setNotice("تم تأكيد بريدك الإلكتروني بنجاح. طلب إنشاء حسابك الآن قيد مراجعة الإدارة، وسيُتاح تسجيل الدخول بعد الموافقة.");
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!identifier.trim() || !password) {
      setError("أدخل اسم المستخدم أو البريد الإلكتروني وكلمة المرور");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identifier,
          password,
          remember,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data?.message || "تعذر تسجيل الدخول");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Navbar />
      <main className="arabtrade-auth-bg text-white flex items-center justify-center px-4 py-10">
      <div className="arabtrade-auth-candles" aria-hidden="true" />
      <div className="arabtrade-auth-chart" aria-hidden="true" />

      <div className="arabtrade-auth-content w-full max-w-md">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-400 transition"
        >
          <ArrowRight size={17} />
          العودة للرئيسية
        </Link>

        <div className="rounded-3xl border border-white/10 bg-[#07101d]/90 p-7 shadow-2xl backdrop-blur-xl">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 border border-blue-400/20">
              <LockKeyhole className="text-blue-400" size={27} />
            </div>

            <h1 className="text-3xl font-bold">تسجيل الدخول</h1>
            <p className="mt-2 text-sm text-slate-400">
              سجّل دخولك إلى حسابك في عرب تريد
            </p>
          </div>

          {notice && (
            <div role="status" className="mb-5 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm leading-6 text-cyan-200">
              {notice}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm text-slate-300">
                اسم المستخدم أو البريد الإلكتروني
              </label>

              <div className="relative">
                <UserRound
                  size={18}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"
                />

                <input
                  type="text"
                  name="identifier"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  placeholder="أدخل اسم المستخدم أو البريد الإلكتروني"
                  className="w-full rounded-2xl border border-white/10 bg-[#050a13] py-3.5 pr-11 pl-4 text-sm outline-none transition focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/10"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">
                كلمة المرور
              </label>

              <div className="relative">
                <LockKeyhole
                  size={18}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"
                />

                <input
                  type={show ? "text" : "password"}
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="أدخل كلمة المرور"
                  className="w-full rounded-2xl border border-white/10 bg-[#050a13] py-3.5 pr-11 pl-12 text-sm outline-none transition focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/10"
                />

                <button
                  type="button"
                  onClick={() => setShow((value) => !value)}
                  aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-blue-400"
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-slate-400">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="accent-blue-500"
                />
                تذكرني
              </label>

              <Link
                href="/forgot-password"
                className="text-blue-400 hover:text-cyan-400 transition"
              >
                نسيت كلمة المرور؟
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-gradient-to-l from-blue-600 to-cyan-500 py-3.5 font-bold text-white shadow-lg shadow-blue-500/10 transition hover:scale-[1.01] hover:shadow-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
            </button>
          </form>

          <div className="my-7 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs text-slate-500">أو</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <p className="text-center text-sm text-slate-400">
            ليس لديك حساب؟{" "}
            <Link
              href="/register"
              className="font-semibold text-blue-400 hover:text-cyan-400"
            >
              إنشاء حساب جديد
            </Link>
          </p>
        </div>
      </div>
      </main>
    </>
  );
}