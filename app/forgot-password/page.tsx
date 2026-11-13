"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, KeyRound, Mail } from "lucide-react";
import Navbar from "@/components/Navbar";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "تعذر إرسال الطلب");
      setMessage(data.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Navbar />
      <main className="arabtrade-auth-hero flex items-center justify-center px-4 py-10 text-white">
        <div className="arabtrade-auth-coins" aria-hidden="true">
          <span className="arabtrade-auth-coin">₿</span>
          <span className="arabtrade-auth-coin">Ξ</span>
          <span className="arabtrade-auth-coin">₿</span>
          <span className="arabtrade-auth-coin">◎</span>
          <span className="arabtrade-auth-coin">Ξ</span>
        </div>
        <div className="arabtrade-auth-lines" aria-hidden="true" />
        <div className="arabtrade-auth-candles" aria-hidden="true" />

        <div className="arabtrade-auth-content w-full max-w-md">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-2 text-sm text-slate-400 transition hover:border-cyan-400/20 hover:bg-cyan-400/[0.06] hover:text-cyan-300"
          >
            <ArrowRight size={17} />
            العودة للرئيسية
          </Link>

          <div className="arabtrade-auth-glass-card rounded-[32px] p-7">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-500/10">
                <KeyRound className="text-blue-400" size={27} />
              </div>

              <h1 className="text-3xl font-bold">نسيت كلمة المرور؟</h1>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                أدخل البريد الإلكتروني المرتبط بحسابك وسنرسل لك تعليمات استعادة كلمة المرور.
              </p>
            </div>

            <form onSubmit={submit} className="space-y-5">
              <div>
                <label htmlFor="forgot-email" className="mb-2 block text-sm text-slate-300">
                  البريد الإلكتروني
                </label>
                <div className="relative">
                  <Mail
                    size={18}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    id="forgot-email"
                    type="email"
                    name="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    dir="ltr"
                    placeholder="example@email.com"
                    className="w-full rounded-2xl border border-white/10 bg-[#050a13] py-3.5 pr-11 pl-4 text-left text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/10"
                  />
                </div>
              </div>

              {message && (
                <div role="status" className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm leading-6 text-emerald-300">
                  {message}
                </div>
              )}
              {error && (
                <div role="alert" className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-300">
                  {error}
                </div>
              )}

              <button
                disabled={busy}
                type="submit"
                className="w-full rounded-2xl bg-gradient-to-l from-blue-600 to-cyan-500 py-3.5 font-bold text-white shadow-lg shadow-blue-500/10 transition hover:scale-[1.01] hover:shadow-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "جارٍ الإرسال..." : "إرسال رابط استعادة كلمة المرور"}
              </button>
            </form>

            <div className="mt-7 text-center text-sm text-slate-400">
              تذكرت كلمة المرور؟{" "}
              <Link
                href="/login"
                className="font-semibold text-blue-400 transition hover:text-cyan-400"
              >
                تسجيل الدخول
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
