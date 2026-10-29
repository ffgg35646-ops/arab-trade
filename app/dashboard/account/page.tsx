"use client";

import { useEffect, useState } from "react";
import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";
import {
  User,
  Mail,
  AtSign,
  ShieldCheck,
  Lock,
  KeyRound,
  CheckCircle2,
  Save,
  Eye,
  EyeOff,
  Copy,
  WalletCards,
} from "lucide-react";

type UserData = {
  id: string;
  name: string;
  username: string;
  email: string;
  referralCode?: string;
  isVerified: boolean;
  isActive: boolean;
  createdAt?: string;
};

export default function AccountPage() {
  const [user, setUser] = useState<UserData | null>(null);

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");

  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const [copied, setCopied] = useState(false);

  async function loadUser() {
    try {
      const response = await fetch("/api/account/profile", {
        credentials: "include",
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data?.user) {
        throw new Error(
          data?.message || "تعذر تحميل بيانات الحساب"
        );
      }

      setUser(data.user);
      setName(data.user.name || "");
      setUsername(data.user.username || "");
      setEmail(data.user.email || "");
    } catch (error: any) {
      setProfileError(
        error?.message || "تعذر تحميل بيانات الحساب"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUser();
  }, []);

  async function saveProfile() {
    setProfileMessage("");
    setProfileError("");

    if (!name.trim() || !username.trim() || !email.trim()) {
      setProfileError("جميع بيانات الحساب مطلوبة");
      return;
    }

    setSavingProfile(true);

    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          username,
          email,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.message || "تعذر حفظ بيانات الحساب"
        );
      }

      setUser(data.user);
      setName(data.user.name || "");
      setUsername(data.user.username || "");
      setEmail(data.user.email || "");

      setProfileMessage("تم الحفظ بنجاح");
    } catch (error: any) {
      setProfileError(
        error?.message || "تعذر حفظ بيانات الحساب"
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword() {
    setPasswordMessage("");
    setPasswordError("");

    if (
      !currentPassword ||
      !newPassword ||
      !confirmPassword
    ) {
      setPasswordError("جميع حقول كلمة المرور مطلوبة");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError(
        "كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف"
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("تأكيد كلمة المرور غير مطابق");
      return;
    }

    setSavingPassword(true);

    try {
      const response = await fetch(
        "/api/account/security/password",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            currentPassword,
            newPassword,
            confirmPassword,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.message || "تعذر تغيير كلمة المرور"
        );
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("تم الحفظ بنجاح");
    } catch (error: any) {
      setPasswordError(
        error?.message || "تعذر تغيير كلمة المرور"
      );
    } finally {
      setSavingPassword(false);
    }
  }

  async function copyUid() {
    if (!user?.id) return;

    try {
      await navigator.clipboard.writeText(user.id);
      setCopied(true);

      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  function getInitial() {
    return (
      user?.name?.trim()?.charAt(0) ||
      user?.username?.trim()?.charAt(0) ||
      "ع"
    ).toUpperCase();
  }

  return (
    <div className="min-h-screen bg-[#050a13]">
      <InternalNavbar />

      <div className="flex min-h-[calc(100vh-5rem)]" dir="rtl">
        <InternalSidebar />

        <main className="min-w-0 flex-1 text-white">
          <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">

            {/* Header */}
            <section className="relative mb-6 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-blue-500/10 via-[#08111e] to-cyan-500/5">
              <div className="absolute -left-20 -top-20 h-52 w-52 rounded-full bg-blue-500/10 blur-3xl" />
              <div className="absolute -bottom-24 right-20 h-56 w-56 rounded-full bg-cyan-400/5 blur-3xl" />

              <div className="relative p-6 sm:p-8">
                <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">

                  <div className="flex items-center gap-5">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-blue-400/20 bg-gradient-to-br from-blue-500/30 to-cyan-400/10 text-3xl font-black text-cyan-300 shadow-xl shadow-blue-500/10">
                      {getInitial()}
                    </div>

                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <h1 className="text-2xl font-black sm:text-3xl">
                          {user?.name || "المستخدم"}
                        </h1>

                        {user?.isVerified ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold text-emerald-300">
                            <CheckCircle2 size={13} />
                            البريد موثق
                          </span>
                        ) : (
                          <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[11px] font-bold text-amber-300">
                            البريد غير موثق
                          </span>
                        )}
                      </div>

                      <p className="text-sm text-slate-400">
                        إدارة الملف الشخصي وبيانات الحساب
                      </p>
                    </div>
                  </div>

                </div>
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">

              {/* Profile */}
              <section className="rounded-3xl border border-white/10 bg-[#08111e] shadow-2xl shadow-black/10">

                <div className="border-b border-white/10 px-6 py-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300">
                      <User size={19} />
                    </div>

                    <div>
                      <h2 className="text-base font-bold">
                        المعلومات الشخصية
                      </h2>

                      <p className="mt-1 text-xs text-slate-500">
                        يمكنك تعديل بيانات حسابك
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-5 p-6">

                  <div>
                    <label className="mb-2 block text-xs font-semibold text-slate-400">
                      الاسم
                    </label>

                    <div className="relative">
                      <User
                        size={17}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600"
                      />

                      <input
                        value={name}
                        disabled={loading}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-[#050a13] px-12 py-3.5 text-sm text-white outline-none transition focus:border-blue-400/40"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold text-slate-400">
                      اسم المستخدم
                    </label>

                    <div className="relative">
                      <AtSign
                        size={17}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600"
                      />

                      <input
                        value={username}
                        disabled={loading}
                        onChange={(e) =>
                          setUsername(
                            e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9_]/g, "")
                          )
                        }
                        className="w-full rounded-2xl border border-white/10 bg-[#050a13] px-12 py-3.5 text-sm text-white outline-none transition focus:border-blue-400/40"
                        dir="ltr"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold text-slate-400">
                      البريد الإلكتروني
                    </label>

                    <div className="relative">
                      <Mail
                        size={17}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600"
                      />

                      <input
                        type="email"
                        value={email}
                        disabled={loading}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-[#050a13] px-12 py-3.5 text-sm text-white outline-none transition focus:border-blue-400/40"
                        dir="ltr"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold text-slate-400">
                      معرف الحساب
                    </label>

                    <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#050a13] p-2">
                      <div className="flex min-w-0 flex-1 items-center gap-3 px-2">
                        <KeyRound
                          size={17}
                          className="shrink-0 text-slate-600"
                        />

                        <span className="truncate font-mono text-xs text-slate-300">
                          {user?.id || "—"}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={copyUid}
                        className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-slate-300 transition hover:border-blue-400/20 hover:bg-blue-500/10 hover:text-cyan-300"
                      >
                        <Copy size={14} />
                        {copied ? "تم النسخ" : "نسخ"}
                      </button>
                    </div>
                  </div>

                  {profileError && (
                    <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">
                      {profileError}
                    </div>
                  )}

                  {profileMessage && (
                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-300">
                      {profileMessage}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={saveProfile}
                    disabled={loading || savingProfile}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save size={17} />
                    {savingProfile
                      ? "جارٍ الحفظ..."
                      : "حفظ التغييرات"}
                  </button>
                </div>
              </section>

              {/* Right */}
              <div className="space-y-6">

                <section className="rounded-3xl border border-white/10 bg-[#08111e] shadow-2xl shadow-black/10">

                  <div className="border-b border-white/10 px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-300">
                        <Lock size={19} />
                      </div>

                      <div>
                        <h2 className="text-base font-bold">
                          تغيير كلمة المرور
                        </h2>

                        <p className="mt-1 text-xs text-slate-500">
                          استخدم كلمة مرور قوية
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 p-6">

                    <div>
                      <label className="mb-2 block text-xs font-semibold text-slate-400">
                        كلمة المرور الحالية
                      </label>

                      <div className="relative">
                        <input
                          type={
                            showCurrentPassword
                              ? "text"
                              : "password"
                          }
                          value={currentPassword}
                          onChange={(e) =>
                            setCurrentPassword(e.target.value)
                          }
                          className="w-full rounded-2xl border border-white/10 bg-[#050a13] px-4 py-3.5 pl-12 text-sm text-white outline-none focus:border-blue-400/40"
                        />

                        <button
                          type="button"
                          onClick={() =>
                            setShowCurrentPassword(
                              (value) => !value
                            )
                          }
                          className="absolute left-3 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-white"
                        >
                          {showCurrentPassword ? (
                            <EyeOff size={17} />
                          ) : (
                            <Eye size={17} />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold text-slate-400">
                        كلمة المرور الجديدة
                      </label>

                      <div className="relative">
                        <input
                          type={
                            showNewPassword
                              ? "text"
                              : "password"
                          }
                          value={newPassword}
                          onChange={(e) =>
                            setNewPassword(e.target.value)
                          }
                          className="w-full rounded-2xl border border-white/10 bg-[#050a13] px-4 py-3.5 pl-12 text-sm text-white outline-none focus:border-blue-400/40"
                        />

                        <button
                          type="button"
                          onClick={() =>
                            setShowNewPassword(
                              (value) => !value
                            )
                          }
                          className="absolute left-3 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-white"
                        >
                          {showNewPassword ? (
                            <EyeOff size={17} />
                          ) : (
                            <Eye size={17} />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold text-slate-400">
                        تأكيد كلمة المرور الجديدة
                      </label>

                      <div className="relative">
                        <input
                          type={
                            showConfirmPassword
                              ? "text"
                              : "password"
                          }
                          value={confirmPassword}
                          onChange={(e) =>
                            setConfirmPassword(e.target.value)
                          }
                          className="w-full rounded-2xl border border-white/10 bg-[#050a13] px-4 py-3.5 pl-12 text-sm text-white outline-none focus:border-blue-400/40"
                        />

                        <button
                          type="button"
                          onClick={() =>
                            setShowConfirmPassword(
                              (value) => !value
                            )
                          }
                          className="absolute left-3 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-white"
                        >
                          {showConfirmPassword ? (
                            <EyeOff size={17} />
                          ) : (
                            <Eye size={17} />
                          )}
                        </button>
                      </div>
                    </div>

                    {passwordError && (
                      <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">
                        {passwordError}
                      </div>
                    )}

                    {passwordMessage && (
                      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-300">
                        {passwordMessage}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={changePassword}
                      disabled={savingPassword}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Lock size={17} />

                      {savingPassword
                        ? "جارٍ التغيير..."
                        : "تغيير كلمة المرور"}
                    </button>
                  </div>
                </section>
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-blue-400/10 bg-blue-500/[0.04] p-5">
              <div className="flex gap-3">
                <ShieldCheck
                  size={19}
                  className="mt-0.5 shrink-0 text-blue-300"
                />

                <div>
                  <h3 className="text-sm font-bold text-slate-200">
                    حماية الحساب
                  </h3>

                  <p className="mt-1 text-xs leading-6 text-slate-500">
                    لا تشارك كلمة المرور أو أي رمز تحقق مع أي شخص.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}