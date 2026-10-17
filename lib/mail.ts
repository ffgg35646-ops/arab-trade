import nodemailer from "nodemailer";

const smtpHost = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
const smtpPort = Number(process.env.SMTP_PORT || 465);
const smtpUser = process.env.SMTP_USER?.trim();
const smtpPass = process.env.SMTP_PASS;

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
});

export async function sendVerificationCode(
  email: string,
  code: string
) {
  if (!smtpUser || !smtpPass) {
    throw new Error(
      "SMTP configuration is incomplete: set SMTP_USER and SMTP_PASS in the deployment environment"
    );
  }

  const from = process.env.MAIL_FROM || smtpUser;

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
