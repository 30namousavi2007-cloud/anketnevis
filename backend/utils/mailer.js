const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
      console.error('❌ EMAIL_USER یا EMAIL_APP_PASSWORD در فایل .env تنظیم نشده‌اند. ارسال ایمیل ناموفق خواهد بود.');
    }
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD,
      },
    });
  }
  return transporter;
}

// ---------------------------------------------------------------------------
// ارسال ایمیل
//  - اگر BREVO_API_KEY تنظیم باشد: از API وب Brevo استفاده می‌شود (روی Render رایگان درگاه SMTP بسته است، ولی HTTPS باز است).
//  - وگرنه اگر MAIL_RELAY_URL تنظیم باشد: از یک «رله‌ی ایمیل» روی Google Apps Script استفاده می‌شود
//    (ایمیل از خود حساب جیمیل شما می‌رود؛ برای کاربرانی که به Brevo دسترسی ندارند. فایل mail-relay/Code.gs).
//  - وگرنه: SMTP جیمیل با EMAIL_USER و EMAIL_APP_PASSWORD (برای اجرای محلی).
// ---------------------------------------------------------------------------
function fromAddress() {
  return {
    email: process.env.MAIL_FROM_EMAIL || process.env.EMAIL_USER || '',
    name: process.env.MAIL_FROM_NAME || 'آنکت‌نویس',
  };
}

async function sendViaBrevo({ to, subject, text, html }) {
  const from = fromAddress();
  if (!from.email) throw new Error('MAIL_FROM_EMAIL تنظیم نشده است (باید یک فرستنده‌ی تأییدشده در Brevo باشد).');
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: from.name, email: from.email },
      to: to.map((email) => ({ email })),
      subject,
      htmlContent: html,
      textContent: text,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch (_) { /* بدنه JSON نبود */ }
    throw new Error(`Brevo API ${res.status}${detail ? `: ${detail}` : ''}`);
  }
}

// رله‌ی Google Apps Script: یک آدرس HTTPS که با توکن مخفی ایمیل می‌فرستد (از حساب جیمیل صاحب اسکریپت)
async function sendViaRelay({ to, subject, text, html }) {
  if (!process.env.MAIL_RELAY_TOKEN) throw new Error('MAIL_RELAY_TOKEN تنظیم نشده است.');
  const res = await fetch(process.env.MAIL_RELAY_URL, {
    method: 'POST',
    redirect: 'follow', // Apps Script پاسخ را بعد از یک ریدایرکت برمی‌گرداند
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      token: process.env.MAIL_RELAY_TOKEN,
      to: to.join(','),
      subject,
      text,
      html,
      name: fromAddress().name,
    }),
    signal: AbortSignal.timeout(20000),
  });
  let data = null;
  try { data = await res.json(); } catch (_) { /* پاسخ JSON نبود */ }
  if (!res.ok || !data || data.ok !== true) {
    throw new Error(`رله‌ی ایمیل ناموفق بود (${res.status})${data && data.error ? `: ${data.error}` : ''}`);
  }
}

async function deliver({ to, subject, text, html }) {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (recipients.length === 0) return;
  if (process.env.BREVO_API_KEY) return sendViaBrevo({ to: recipients, subject, text, html });
  if (process.env.MAIL_RELAY_URL) return sendViaRelay({ to: recipients, subject, text, html });
  const from = fromAddress();
  return getTransporter().sendMail({ from: `"${from.name}" <${from.email}>`, to: recipients.join(','), subject, text, html });
}

async function sendOtpEmail(toEmail, code, purpose = 'login') {
  const title = purpose === 'register' ? 'کد تأیید ایمیل' : purpose === 'reset' ? 'کد بازیابی رمز عبور' : 'کد ورود';
  const mailOptions = {
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

  await deliver({ to: toEmails, subject: `سفارش چاپی جدید: ${order.item_title}`, text, html });
}

module.exports = { sendOtpEmail, sendPrintOrderEmail };
