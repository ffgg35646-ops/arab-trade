"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, KeyRound, Mail } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "تعذر إرسال الطلب");
      setMessage(data.message);
    } catch (e) { setError(e instanceof Error ? e.message : "حدث خطأ"); }
    finally { setBusy(false); }
  }
  return (
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
              <KeyRound className="text-blue-400" size={27} />
            </div>

            <h1 className="text-3xl font-bold">نسيت كلمة المرور؟</h1>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              أدخل البريد الإلكتروني المرتبط بحسابك وسنرسل لك تعليمات
              استعادة كلمة المرور.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm text-slate-300">
                البريد الإلكتروني
              </label>

              <div className="relative">
                <Mail
                  size={18}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"
                />

                <input
                  type="email"
                  name="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="example@email.com"
                  className="w-full rounded-2xl border border-white/10 bg-[#050a13] py-3.5 pr-11 pl-4 text-sm outline-none transition focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/10"
                />
              </div>
            </div>

            {message && <p role="status" className="text-sm text-emerald-300">{message}</p>}
            {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
            <button
              disabled={busy}
              type="submit"
              className="w-full rounded-2xl bg-gradient-to-l from-blue-600 to-cyan-500 py-3.5 font-bold text-white shadow-lg shadow-blue-500/10 transition hover:scale-[1.01] hover:shadow-blue-500/20"
            >
              {busy ? "جارٍ الإرسال..." : "إرسال رابط استعادة كلمة المرور"}
            </button>
          </form>

          <div className="mt-7 text-center text-sm text-slate-400">
            تذكرت كلمة المرور؟{" "}
            <Link
              href="/login"
              className="font-semibold text-blue-400 hover:text-cyan-400"
            >
              تسجيل الدخول
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}