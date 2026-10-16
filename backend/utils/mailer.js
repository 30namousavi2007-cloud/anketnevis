const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
      console.error('❌ EMAIL_USER یا EMAIL_APP_PASSWORD در فایل .env تنظیم نشده‌اند. ارسال ایمیل ناموفق خواهد بود.');
    }
    transporter = nodemailer.createTransport({
      service: 'gmail',
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD,
      },
    });
  }
  return transporter;
}


// روی پلن رایگان Render پورت‌های SMTP (۲۵، ۴۶۵، ۵۸۷) بسته است و Gmail کار نمی‌کند.
// اگر BREVO_API_KEY تنظیم باشد ایمیل از طریق API وب (HTTPS) فرستاده می‌شود؛ وگرنه همان SMTP قبلی.
// فرستنده (EMAIL_FROM یا EMAIL_USER) باید در پنل Brevo به‌عنوان Sender تأیید شده باشد.
async function sendViaBrevo({ to, subject, text, html }) {
  const senderEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  const recipients = String(to).split(',').map((e) => ({ email: e.trim() })).filter((r) => r.email);
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { name: 'آنکت‌نویس', email: senderEmail }, to: recipients, subject, textContent: text, htmlContent: html }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Brevo API ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

async function deliver(mail) {
  if (process.env.BREVO_API_KEY) return sendViaBrevo(mail);
  return getTransporter().sendMail(mail);
}

async function sendOtpEmail(toEmail, code, purpose = 'login') {
  const isRegister = purpose === 'register';
  const title = isRegister ? 'کد تأیید ایمیل' : 'کد ورود';
  const mailOptions = {
    from: `"آنکت‌نویس" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: `${title} شما: ${code}`,
    text: `${title} شما در آنکت‌نویس: ${code}\nاین کد تا ۵ دقیقه دیگر معتبر است.`,
    html: `
      <div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; max-width: 420px; margin: 0 auto; padding: 24px; border: 1px solid #eee; border-radius: 12px;">
        <h2 style="color:#C81E2C;">آنکت‌نویس</h2>
        <p>${title} شما:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; background:#f8f8f8; padding: 16px; border-radius: 8px; text-align:center;">${code}</div>
        <p style="color:#777; font-size: 13px; margin-top: 16px;">این کد تا ۵ دقیقه دیگر معتبر است. اگر شما این درخواست را نداده‌اید، این ایمیل را نادیده بگیرید.</p>
      </div>
    `,
  };

  await deliver(mailOptions);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ایمیل سفارش چاپیِ جدید به نویسنده‌ی اثر و ادمین‌ها
async function sendPrintOrderEmail(toEmails, order, buyer) {
  const amount = Number(order.amount).toLocaleString('fa-IR');
  const rows = [
    ['اثر', order.item_title],
    ['مبلغ پرداخت‌شده', `${amount} تومان`],
    ['کد رهگیری پرداخت', order.ref_id || '—'],
    ['نام گیرنده', order.ship_name],
    ['آدرس', order.ship_address],
    ['شماره تماس', order.ship_phone],
    ['خریدار (حساب کاربری)', `${buyer.name || ''} ${buyer.email ? `(${buyer.email})` : ''}`.trim()],
  ];
  const text = ['سفارش جدید نسخه‌ی چاپی در آنکت‌نویس', '', ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n');
  const html = `
    <div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #eee; border-radius: 12px;">
      <h2 style="color:#C81E2C;">سفارش جدید نسخه‌ی چاپی</h2>
      <table style="width:100%; border-collapse: collapse; font-size: 14px;">
        ${rows.map(([k, v]) => `<tr><td style="padding:8px; color:#777; white-space:nowrap; vertical-align:top;">${escapeHtml(k)}</td><td style="padding:8px;">${escapeHtml(v)}</td></tr>`).join('')}
      </table>
    </div>`;

  await deliver({
    from: `"آنکت‌نویس" <${process.env.EMAIL_USER}>`,
    to: toEmails.join(','),
    subject: `سفارش چاپی جدید: ${order.item_title}`,
    text,
    html,
  });
}

module.exports = { sendOtpEmail, sendPrintOrderEmail };
