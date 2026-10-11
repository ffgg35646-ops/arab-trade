"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";

export default function VerifyEmailPage() {
  const router = useRouter();

  const [code, setCode] = useState("");
  const [seconds, setSeconds] = useState(600);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (seconds <= 0) return;

    const timer = setInterval(() => {
      setSeconds((value) => value - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [seconds]);

  async function submit(e: FormEvent) {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "كود التفعيل غير صحيح");
        return;
      }

      router.push("/login?verified=1");
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }

  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");

  const secs = (seconds % 60)
    .toString()
    .padStart(2, "0");

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#050a13] text-white"
    >
      <div className="flex min-h-screen items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          <Link
            href="/register"
            className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
          >
            <ArrowRight size={18} />
            العودة للتسجيل
          </Link>

          <div className="rounded-3xl border border-white/[0.08] bg-[#07101d]/90 p-7 text-center shadow-2xl backdrop-blur-2xl sm:p-9">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-400/10">
              <MailCheck
                size={32}
                className="text-cyan-300"
              />
            </div>

            <h1 className="text-2xl font-bold">
              تأكيد البريد الإلكتروني
            </h1>

            <p className="mt-3 text-sm leading-7 text-slate-400">
              أرسلنا كود تفعيل إلى بريدك الإلكتروني.
              <br />
              أدخل الكود المكون من 6 أرقام لإكمال التسجيل.
            </p>

            {error && (
              <div className="mt-5 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <form
              onSubmit={submit}
              className="mt-7"
            >
              <input
                value={code}
                onChange={(e) =>
                  setCode(
                    e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 6)
                  )
                }
                inputMode="numeric"
                maxLength={6}
                dir="ltr"
                placeholder="000000"
                className="w-full rounded-2xl border border-white/[0.08] bg-[#050a13] px-4 py-5 text-center text-3xl font-bold tracking-[0.45em] text-white outline-none focus:border-blue-400/50"
              />

              <div className="mt-5 text-sm text-slate-500">
                الكود صالح لمدة{" "}
                <span className="font-bold text-cyan-300">
                  {minutes}:{secs}
                </span>
              </div>

              <button
                disabled={loading || code.length !== 6}
                className="mt-6 w-full rounded-xl bg-blue-500 px-5 py-3.5 font-bold transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading
                  ? "جارٍ التحقق..."
                  : "تأكيد الحساب"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}