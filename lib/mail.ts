import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: Number(process.env.SMTP_PORT || 465) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendVerificationCode(
  email: string,
  code: string
) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;

  await transporter.sendMail({
    from,
    to: email,
    subject: "كود تفعيل حساب عرب تريد",
    text: `كود تفعيل حسابك في عرب تريد هو: ${code}

الكود صالح لمدة 10 دقائق فقط.

إذا لم تطلب إنشاء هذا الحساب، تجاهل هذه الرسالة.`,
    html: `
      <div dir="rtl" style="font-family:Arial,sans-serif;background:#050a13;padding:30px;color:#fff">
        <div style="max-width:520px;margin:auto;background:#07101d;border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:30px;text-align:center">
          <h1 style="color:#3b82f6">عرب تريد</h1>
          <p style="color:#cbd5e1">كود تفعيل حسابك هو</p>
          <div style="font-size:36px;font-weight:800;letter-spacing:10px;color:#22d3ee;margin:25px 0">
            ${code}
          </div>
          <p style="color:#94a3b8">الكود صالح لمدة 10 دقائق فقط.</p>
        </div>
      </div>
    `,
  });
}