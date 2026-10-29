"use client";

import { useEffect, useState } from "react";

export default function VerificationPage() {
  const [verified, setVerified] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const [form, setForm] = useState({
    fullName: "",
    country: "",
    documentType: "national_id",
    documentNumber: "",
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const res = await fetch("/api/account/verification", {
      credentials: "include",
      cache: "no-store",
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.message || "تعذر تحميل حالة التحقق");
    }

    setVerified(Boolean(data.verified));
    setRequests(data.requests || []);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    const res = await fetch("/api/account/verification", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      setError(data.message || "تعذر إرسال طلب التحقق");
      return;
    }

    setMessage(data.message || "تم إرسال الطلب");
    await load();
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#050a13] px-4 py-8 text-white md:px-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold">التحقق من الحساب</h1>

        {verified ? (
          <div className="mt-6 rounded-2xl border border-green-500/20 bg-green-500/5 p-6 text-green-300">
            حسابك موثق بالفعل.
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="mt-6 rounded-2xl border border-white/10 bg-[#07101d] p-6"
          >
            {error && (
              <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-red-300">
                {error}
              </div>
            )}

            {message && (
              <div className="mb-4 rounded-xl border border-green-500/20 bg-green-500/5 p-4 text-green-300">
                {message}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={form.fullName}
                onChange={(e) =>
                  setForm({ ...form, fullName: e.target.value })
                }
                placeholder="الاسم الكامل"
                className="rounded-xl border border-white/10 bg-[#050a13] px-4 py-3"
                required
              />

              <input
                value={form.country}
                onChange={(e) =>
                  setForm({ ...form, country: e.target.value })
                }
                placeholder="الدولة"
                className="rounded-xl border border-white/10 bg-[#050a13] px-4 py-3"
                required
              />

              <select
                value={form.documentType}
                onChange={(e) =>
                  setForm({ ...form, documentType: e.target.value })
                }
                className="rounded-xl border border-white/10 bg-[#050a13] px-4 py-3"
              >
                <option value="national_id">هوية وطنية</option>
                <option value="passport">جواز سفر</option>
                <option value="driver_license">رخصة قيادة</option>
              </select>

              <input
                value={form.documentNumber}
                onChange={(e) =>
                  setForm({ ...form, documentNumber: e.target.value })
                }
                placeholder="رقم الوثيقة"
                className="rounded-xl border border-white/10 bg-[#050a13] px-4 py-3"
                required
              />
            </div>

            <button
              className="mt-5 w-full rounded-xl bg-white px-4 py-3 font-semibold text-black"
            >
              إرسال طلب التحقق
            </button>
          </form>
        )}

        <section className="mt-6 rounded-2xl border border-white/10 bg-[#07101d]">
          <div className="border-b border-white/10 p-5 font-semibold">
            سجل طلبات التحقق
          </div>

          {requests.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              لا توجد طلبات.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {requests.map((item) => (
                <div key={item._id} className="p-5">
                  <div className="flex justify-between gap-4">
                    <span>{item.documentType}</span>
                    <span>{item.status}</span>
                  </div>
                  {item.adminNote && (
                    <div className="mt-2 text-sm text-slate-500">
                      ملاحظة الطلب: {item.adminNote}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}