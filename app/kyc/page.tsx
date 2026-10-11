"use client";

import { useEffect, useState } from "react";

export default function KycPage() {
  const [status, setStatus] = useState("loading");
  const [rejectionReason, setRejectionReason] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  async function loadStatus() {
    const res = await fetch("/api/kyc", {
      credentials: "include",
      cache: "no-store",
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setStatus("error");
      setMessage(json?.message || "تعذر تحميل حالة التوثيق");
      return;
    }

    setStatus(json?.kyc?.status || "none");
    setRejectionReason(json?.kyc?.rejectionReason || "");
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);
    setMessage("");

    try {
      const form = new FormData(e.currentTarget);

      const documentFile = form.get("documentFile");
      const selfieFile = form.get("selfieFile");

      if (!(documentFile instanceof File) || documentFile.size === 0) {
        setMessage("ارفع صورة الوثيقة");
        return;
      }

      if (!(selfieFile instanceof File) || selfieFile.size === 0) {
        setMessage("ارفع صورة السيلفي وأنت ممسك بالوثيقة");
        return;
      }

      const res = await fetch("/api/kyc", {
        method: "POST",
        credentials: "include",
        body: form,
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage(json?.message || "تعذر إرسال الطلب");
        return;
      }

      setStatus("pending");
      setMessage("تم إرسال طلب التوثيق للمراجعة.");
      e.currentTarget.reset();
    } catch {
      setMessage("حدث خطأ أثناء إرسال الطلب");
    } finally {
      setSending(false);
    }
  }

  if (status === "loading") {
    return (
      <main dir="rtl" className="min-h-screen bg-[#050a13] p-6 text-white">
        جاري تحميل حالة التوثيق...
      </main>
    );
  }

  if (status === "approved") {
    return (
      <main dir="rtl" className="min-h-screen bg-[#050a13] p-6 text-white">
        <div className="mx-auto max-w-2xl rounded-2xl border border-emerald-900/50 bg-[#08111e] p-8">
          <h1 className="text-2xl font-black text-emerald-300">
            تم توثيق حسابك
          </h1>
          <p className="mt-3 text-slate-400">
            حسابك موثق ويمكنك استخدام العمليات التي تتطلب التحقق.
          </p>
        </div>
      </main>
    );
  }

  if (status === "pending") {
    return (
      <main dir="rtl" className="min-h-screen bg-[#050a13] p-6 text-white">
        <div className="mx-auto max-w-2xl rounded-2xl border border-yellow-900/50 bg-[#08111e] p-8">
          <h1 className="text-2xl font-black text-yellow-300">
            طلبك قيد المراجعة
          </h1>
          <p className="mt-3 text-slate-400">
            تم استلام بياناتك وسيتم مراجعتها يدويًا من فريق المنصة.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#050a13] p-6 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h1 className="text-3xl font-black">توثيق الحساب</h1>
          <p className="mt-2 text-slate-400">
            ارفع وثيقة الهوية وصورة سيلفي وأنت ممسك بنفس الوثيقة.
          </p>
        </div>

        {status === "rejected" && rejectionReason ? (
          <div className="mb-5 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">
            تم رفض الطلب السابق: {rejectionReason}
          </div>
        ) : null}

        {message ? (
          <div className="mb-5 rounded-xl border border-slate-800 bg-[#08111e] p-4 text-sm text-slate-300">
            {message}
          </div>
        ) : null}

        <form
          onSubmit={submit}
          className="space-y-5 rounded-2xl border border-slate-800 bg-[#08111e] p-6"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <input
              name="fullName"
              required
              placeholder="الاسم الكامل كما في الوثيقة"
              className="rounded-xl border border-slate-700 bg-[#0b1422] p-4 outline-none"
            />

            <input
              name="dateOfBirth"
              required
              type="date"
              className="rounded-xl border border-slate-700 bg-[#0b1422] p-4 outline-none"
            />

            <input
              name="nationality"
              required
              placeholder="الجنسية"
              className="rounded-xl border border-slate-700 bg-[#0b1422] p-4 outline-none"
            />

            <select
              name="documentType"
              required
              className="rounded-xl border border-slate-700 bg-[#0b1422] p-4 outline-none"
            >
              <option value="">نوع الوثيقة</option>
              <option value="national_id">الهوية الوطنية</option>
              <option value="passport">جواز السفر</option>
            </select>

            <input
              name="documentNumber"
              required
              placeholder="رقم الوثيقة"
              className="rounded-xl border border-slate-700 bg-[#0b1422] p-4 outline-none"
            />

            <input
              name="issuingCountry"
              required
              placeholder="بلد الإصدار"
              className="rounded-xl border border-slate-700 bg-[#0b1422] p-4 outline-none"
            />

            <input
              name="issueDate"
              type="date"
              className="rounded-xl border border-slate-700 bg-[#0b1422] p-4 outline-none"
            />

            <input
              name="expiryDate"
              type="date"
              className="rounded-xl border border-slate-700 bg-[#0b1422] p-4 outline-none"
            />
          </div>

          <div className="rounded-xl border border-slate-800 p-4">
            <label className="mb-2 block font-bold">
              صورة الهوية أو جواز السفر
            </label>
            <input
              name="documentFile"
              required
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="block w-full text-sm"
            />
          </div>

          <div className="rounded-xl border border-slate-800 p-4">
            <label className="mb-2 block font-bold">
              صورة سيلفي وأنت ممسك بالوثيقة
            </label>
            <p className="mb-3 text-xs text-slate-500">
              يجب أن يظهر الوجه والوثيقة معًا بوضوح في نفس الصورة.
            </p>
            <input
              name="selfieFile"
              required
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="user"
              className="block w-full text-sm"
            />
          </div>

          <button
            disabled={sending}
            className="w-full rounded-xl bg-blue-600 px-5 py-4 font-black disabled:opacity-50"
          >
            {sending ? "جاري إرسال الطلب..." : "إرسال طلب التوثيق"}
          </button>
        </form>
      </div>
    </main>
  );
}