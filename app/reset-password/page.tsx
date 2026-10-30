"use client";
import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    if (password.length < 8 || password.length > 128) { setError("كلمة المرور يجب أن تكون بين 8 و128 حرفًا"); return; }
    if (password !== confirm) { setError("تأكيد كلمة المرور غير مطابق"); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "تعذر الاستعادة");
      setMessage(data.message); setPassword(""); setConfirm("");
    } catch (e) { setError(e instanceof Error ? e.message : "حدث خطأ"); }
    finally { setBusy(false); }
  }
  return <main dir="rtl" className="arabtrade-auth-bg flex min-h-screen items-center justify-center px-4 text-white">
    <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#07101d] p-6">
      <h1 className="mb-3 text-2xl font-bold">إنشاء كلمة مرور جديدة</h1>
      {!token ? <p className="text-red-300">رابط الاستعادة غير صالح. اطلب رابطًا جديدًا.</p> :
      <form onSubmit={submit} className="space-y-4">
        <input type="password" autoComplete="new-password" required minLength={8} maxLength={128} placeholder="كلمة المرور الجديدة" value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#050a13] p-3" />
        <input type="password" autoComplete="new-password" required placeholder="تأكيد كلمة المرور" value={confirm} onChange={e=>setConfirm(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#050a13] p-3" />
        <button disabled={busy || !!message} className="w-full rounded-xl bg-blue-600 p-3 font-bold disabled:opacity-50">{busy ? "جارٍ الحفظ..." : "حفظ كلمة المرور"}</button>
      </form>}
      {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
      {message && <p role="status" className="mt-4 text-sm text-emerald-300">{message}</p>}
      <Link href="/login" className="mt-5 inline-block text-sm text-cyan-300">العودة لتسجيل الدخول</Link>
    </div></main>;
}
export default function ResetPasswordPage() { return <Suspense fallback={<main className="min-h-screen bg-[#050a13]" />}><ResetForm /></Suspense>; }
