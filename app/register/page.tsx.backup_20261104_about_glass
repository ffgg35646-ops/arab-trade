"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, ShieldCheck, ImagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";

type IdentityKey = "identityFront" | "identityBack" | "identitySelfie";
type IdentityFiles = Record<IdentityKey, File | null>;

const MAX_IDENTITY_FILE_BYTES = 820 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function prepareIdentityImage(file: File): Promise<File> {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("ارفع صورة بصيغة JPG أو PNG أو WEBP.");
  }
  if (file.size <= MAX_IDENTITY_FILE_BYTES) return file;

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const dimensions = [1800, 1600, 1400, 1200];
  const qualities = [0.9, 0.84, 0.78, 0.72];

  try {
    for (const maxDimension of dimensions) {
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("تعذر تجهيز الصورة على هذا الجهاز.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of qualities) {
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, "image/jpeg", quality);
        });
        if (blob && blob.size <= MAX_IDENTITY_FILE_BYTES) {
          const baseName = file.name.replace(/\.[^.]+$/, "") || "identity";
          return new File([blob], baseName + ".jpg", {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
        }
      }
    }
  } finally {
    bitmap.close();
  }

  throw new Error("حجم الصورة ما زال كبيرًا. جرّب صورة أصغر أو التقط الصورة من جديد.");
}

export default function RegisterPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [identityFiles, setIdentityFiles] = useState<IdentityFiles>({
    identityFront: null,
    identityBack: null,
    identitySelfie: null,
  });

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
    setForm((old) => ({ ...old, referralCode: old.referralCode || ref }));
  }, []);

  async function updateIdentityFile(key: IdentityKey, file: File | null) {
    if (!file) {
      setIdentityFiles((old) => ({ ...old, [key]: null }));
      return;
    }
    setError("");
    setCompressing(true);
    try {
      const prepared = await prepareIdentityImage(file);
      setIdentityFiles((old) => ({ ...old, [key]: prepared }));
    } catch (e) {
      setIdentityFiles((old) => ({ ...old, [key]: null }));
      setError(e instanceof Error ? e.message : "تعذر تجهيز الصورة");
    } finally {
      setCompressing(false);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (!identityFiles.identityFront || !identityFiles.identityBack || !identityFiles.identitySelfie) {
      setError("ارفع الصور الثلاث المطلوبة قبل إنشاء الحساب.");
      return;
    }
    if (compressing) {
      setError("انتظر حتى ينتهي تجهيز الصور.");
      return;
    }

    setLoading(true);
    try {
      const payload = new FormData();
      payload.set("name", form.name);
      payload.set("username", form.username);
      payload.set("email", form.email);
      payload.set("password", form.password);
      payload.set("confirmPassword", form.confirmPassword);
      payload.set("referralCode", form.referralCode);
      payload.set("identityFront", identityFiles.identityFront);
      payload.set("identityBack", identityFiles.identityBack);
      payload.set("identitySelfie", identityFiles.identitySelfie);

      const res = await fetch("/api/auth/register", {
        method: "POST",
        body: payload,
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

  function update(key: keyof typeof form, value: string) {
    setForm((old) => ({ ...old, [key]: value }));
  }

  const uploadFields: { key: IdentityKey; label: string; description: string }[] = [
    {
      key: "identityFront",
      label: "الوجه الأمامي للهوية",
      description: "صورة واضحة للوجه الأمامي",
    },
    {
      key: "identityBack",
      label: "الوجه الخلفي للهوية",
      description: "صورة واضحة للوجه الخلفي",
    },
    {
      key: "identitySelfie",
      label: "صورتك وأنت ممسك بالهوية",
      description: "يجب أن يظهر وجهك والهوية بوضوح",
    },
  ];

  return (
    <>
      <Navbar />
      <main className="arabtrade-auth-hero flex items-center justify-center px-4 py-10 text-white">
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

          <div className="relative z-10 mx-auto flex min-h-screen max-w-2xl items-center justify-center px-5 py-10">
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
                    <ShieldCheck size={28} className="text-blue-400" />
                  </div>
                  <h1 className="text-2xl font-bold sm:text-3xl">إنشاء حساب</h1>
                  <p className="mt-2 text-sm text-slate-400">
                    انضم إلى عرب تريد وابدأ رحلتك في الأسواق
                  </p>
                </div>

                {error && (
                  <div role="alert" className="mb-5 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {error}
                  </div>
                )}

                <form onSubmit={submit} className="space-y-5">
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
                      onChange={(v) => update("confirmPassword", v)}
                    />
                    <Field
                      label="كود الإحالة"
                      value={form.referralCode}
                      onChange={(v) => update("referralCode", v)}
                      placeholder="اختياري"
                      dir="ltr"
                      optional
                    />
                  </div>

                  <div className="border-t border-white/[0.08] pt-5">
                    <h2 className="mb-1 text-base font-bold text-white">صور إثبات الهوية</h2>
                    <p className="mb-4 text-sm text-slate-400">
                      ارفع الصور الثلاث لإرسال طلب إنشاء الحساب للمراجعة.
                    </p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {uploadFields.map((item) => (
                        <label
                          key={item.key}
                          className="block rounded-2xl border border-white/10 bg-[#050a13]/70 p-4 transition hover:border-blue-400/40"
                        >
                          <span className="mb-2 block text-sm font-semibold text-slate-200">
                            {item.label} <span className="text-red-400">*</span>
                          </span>
                          <span className="mb-3 block text-xs text-slate-500">{item.description}</span>
                          <span className="flex items-center gap-2 rounded-xl border border-dashed border-white/15 px-3 py-3 text-sm text-slate-300">
                            <ImagePlus size={18} className="shrink-0 text-blue-300" />
                            {identityFiles[item.key] ? "تم اختيار الصورة" : "اختيار صورة"}
                          </span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            required
                            className="mt-3 block w-full text-xs text-slate-400 file:ml-3 file:rounded-lg file:border-0 file:bg-blue-500/15 file:px-3 file:py-2 file:font-semibold file:text-blue-200 hover:file:bg-blue-500/25"
                            onChange={(e) => void updateIdentityFile(item.key, e.target.files?.[0] || null)}
                          />
                          {identityFiles[item.key] && (
                            <span className="mt-2 block break-all text-xs text-emerald-300">
                              {identityFiles[item.key]?.name} · {Math.max(1, Math.round((identityFiles[item.key]?.size || 0) / 1024))} KB
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                    <p className="mt-3 text-xs leading-6 text-slate-500">
                      ملاحظة: قد يُطلب منك لاحقًا إرسال صورة سيلفي إضافية لتأكيد هويتك عند الحاجة.
                    </p>
                  </div>

                  <div className="flex justify-center pt-1">
                    <button
                      disabled={loading || compressing}
                      className="w-full max-w-sm rounded-xl bg-blue-500 px-8 py-3.5 font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {compressing
                        ? "جارٍ تجهيز الصور..."
                        : loading
                          ? "جارٍ إرسال كود التفعيل..."
                          : "إنشاء الحساب"}
                    </button>
                  </div>
                </form>

                <p className="mt-7 text-center text-sm text-slate-400">
                  لديك حساب بالفعل؟{" "}
                  <Link href="/login" className="font-bold text-blue-400 hover:text-cyan-300">
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
        {optional && <span className="mr-2 text-xs text-slate-500">اختياري</span>}
      </span>
      <input
        type={type}
        value={value}
        dir={dir}
        required={!optional}
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
      <span className="mb-2 block text-sm font-medium text-slate-300">{label}</span>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          dir="ltr"
          required
          minLength={8}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-white/[0.08] bg-[#050a13]/80 px-4 py-3 pl-12 text-sm text-white outline-none transition focus:border-blue-400/50 focus:ring-2 focus:ring-blue-500/10"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </label>
  );
}
