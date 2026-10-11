"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";

export default function RegisterPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    referralCode: "",
  });

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search)
      .get("ref")
      ?.trim()
      .toUpperCase();

    if (!ref) return;

    setForm((old) => ({
      ...old,
      referralCode: old.referralCode || ref,
    }));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "تعذر إنشاء الحساب");
        return;
      }

      router.push("/verify-email");
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }

  function update(
    key: keyof typeof form,
    value: string
  ) {
    setForm((old) => ({
      ...old,
      [key]: value,
    }));
  }

  return (
    <>
      <Navbar />
      <main className="arabtrade-auth-hero text-white flex items-center justify-center px-4 py-10">
      <div className="arabtrade-auth-coins" aria-hidden="true">
        <span className="arabtrade-auth-coin">₿</span>
        <span className="arabtrade-auth-coin">Ξ</span>
        <span className="arabtrade-auth-coin">₿</span>
        <span className="arabtrade-auth-coin">◎</span>
        <span className="arabtrade-auth-coin">₿</span>
      </div>

      <div className="arabtrade-auth-lines" aria-hidden="true" />
      <div className="arabtrade-auth-candles" aria-hidden="true" />
      <div className="relative min-h-screen overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/4 top-20 h-72 w-72 rounded-full bg-blue-600/10 blur-[120px]" />
          <div className="absolute bottom-10 right-1/4 h-72 w-72 rounded-full bg-cyan-400/10 blur-[120px]" />
        </div>

        <div className="relative z-10 mx-auto flex min-h-screen max-w-xl items-center justify-center px-5 py-10">
          <div className="w-full">
            <Link
              href="/"
              className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
            >
              <ArrowRight size={18} />
              العودة للرئيسية
            </Link>

            <div className="rounded-3xl border border-white/[0.08] bg-[#07101d]/85 p-6 shadow-2xl backdrop-blur-2xl sm:p-8">
              <div className="mb-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-500/10">
                  <ShieldCheck
                    size={28}
                    className="text-blue-400"
                  />
                </div>

                <h1 className="text-2xl font-bold sm:text-3xl">
                  إنشاء حساب
                </h1>

                <p className="mt-2 text-sm text-slate-400">
                  انضم إلى عرب تريد وابدأ رحلتك في الأسواق
                </p>
              </div>

              {error && (
                <div className="mb-5 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              <form
                onSubmit={submit}
                className="space-y-5"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    label="الاسم"
                    value={form.name}
                    onChange={(v) => update("name", v)}
                    placeholder="اكتب اسمك"
                  />

                  <Field
                    label="اسم المستخدم"
                    value={form.username}
                    onChange={(v) => update("username", v)}
                    placeholder="username"
                    dir="ltr"
                  />

                  <Field
                    label="البريد الإلكتروني"
                    type="email"
                    value={form.email}
                    onChange={(v) => update("email", v)}
                    placeholder="name@example.com"
                    dir="ltr"
                  />

                  <PasswordField
                    label="كلمة المرور"
                    value={form.password}
                    show={showPassword}
                    onToggle={() => setShowPassword(!showPassword)}
                    onChange={(v) => update("password", v)}
                  />

                  <PasswordField
                    label="تأكيد كلمة المرور"
                    value={form.confirmPassword}
                    show={showConfirm}
                    onToggle={() => setShowConfirm(!showConfirm)}
                    onChange={(v) =>
                      update("confirmPassword", v)
                    }
                  />

                  <Field
                    label="كود الإحالة"
                    value={form.referralCode}
                    onChange={(v) =>
                      update("referralCode", v)
                    }
                    placeholder="اختياري"
                    dir="ltr"
                    optional
                  />
                </div>

                <div className="flex justify-center pt-1">
                  <button
                    disabled={loading}
                    className="w-full max-w-sm rounded-xl bg-blue-500 px-8 py-3.5 font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading
                      ? "جارٍ إرسال كود التفعيل..."
                      : "إنشاء الحساب"}
                  </button>
                </div>
              </form>

              <p className="mt-7 text-center text-sm text-slate-400">
                لديك حساب بالفعل؟{" "}
                <Link
                  href="/login"
                  className="font-bold text-blue-400 hover:text-cyan-300"
                >
                  تسجيل الدخول
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
      </main>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  dir,
  optional,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  dir?: "ltr" | "rtl";
  optional?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-300">
        {label}
        {optional && (
          <span className="mr-2 text-xs text-slate-500">
            اختياري
          </span>
        )}
      </span>

      <input
        type={type}
        value={value}
        dir={dir}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/[0.08] bg-[#050a13]/80 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-400/50 focus:ring-2 focus:ring-blue-500/10"
      />
    </label>
  );
}

function PasswordField({
  label,
  value,
  show,
  onToggle,
  onChange,
}: {
  label: string;
  value: string;
  show: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-300">
        {label}
      </span>

      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          dir="ltr"
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-white/[0.08] bg-[#050a13]/80 px-4 py-3 pl-12 text-sm text-white outline-none transition focus:border-blue-400/50 focus:ring-2 focus:ring-blue-500/10"
        />

        <button
          type="button"
          onClick={onToggle}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
        >
          {show ? (
            <EyeOff size={18} />
          ) : (
            <Eye size={18} />
          )}
        </button>
      </div>
    </label>
  );
}