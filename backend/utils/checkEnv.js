// بررسی تنظیمات هنگام اجرا. در حالت production اگر تنظیمات ناامن باشد، سرور بالا نمی‌آید
// تا اشتباهی با کلید آزمایشی یا آدرس localhost پول واقعی دریافت نشود.

// دامنه‌های «ثبت‌عمومی» که هر زیردامنه‌شان یک سایت جداست (فهرست Public Suffix). کوکی بین این زیردامنه‌ها رد و بدل نمی‌شود.
const SHARED_SUFFIXES = [
  'onrender.com', 'vercel.app', 'netlify.app', 'pages.dev', 'workers.dev', 'herokuapp.com',
  'github.io', 'gitlab.io', 'fly.dev', 'railway.app', 'up.railway.app', 'web.app', 'firebaseapp.com',
  'azurewebsites.net', 'surge.sh', 'glitch.me', 'repl.co', 'ngrok.io', 'ngrok-free.app',
];
const SECOND_LEVEL_IR = ['co.ir', 'ac.ir', 'org.ir', 'gov.ir', 'sch.ir', 'net.ir', 'id.ir'];

// «سایت» (registrable domain) یک آدرس؛ دو آدرس با سایت یکسان می‌توانند کوکی را به‌صورت first-party رد و بدل کنند
function registrableDomain(urlOrHost) {
  let host = '';
  try { host = new URL(urlOrHost).hostname; } catch (_) { host = String(urlOrHost || ''); }
  host = host.toLowerCase();
  const labels = host.split('.');
  const shared = SHARED_SUFFIXES.find((s) => host === s || host.endsWith(`.${s}`));
  if (shared) return labels.slice(-(shared.split('.').length + 1)).join('.');
  if (SECOND_LEVEL_IR.some((s) => host.endsWith(`.${s}`))) return labels.slice(-3).join('.');
  return labels.slice(-2).join('.');
}

function checkEnv() {
  const isProd = process.env.NODE_ENV === 'production';
  const errors = [];
  const warnings = [];

  const need = (name) => {
    if (!process.env[name] || !String(process.env[name]).trim()) errors.push(`متغیر ${name} تنظیم نشده است.`);
  };
  need('DATABASE_URL');
  need('JWT_SECRET');

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    (isProd ? errors : warnings).push('JWT_SECRET باید حداقل ۳۲ کاراکتر تصادفی باشد.');
  }

  const sandbox = String(process.env.ZARINPAL_SANDBOX ?? 'true').toLowerCase() !== 'false';
  const merchant = (process.env.ZARINPAL_MERCHANT_ID || '').trim();
  const isLocalUrl = (u) => !u || /localhost|127\.0\.0\.1/.test(u);

  if (isProd) {
    if (!sandbox && !/^[0-9a-fA-F-]{36}$/.test(merchant)) {
      errors.push('برای پرداخت واقعی، ZARINPAL_MERCHANT_ID باید مرچنت‌کد ۳۶ کاراکتری زرین‌پال باشد.');
    }
    if (!/^https:\/\//.test(process.env.BACKEND_URL || '') || isLocalUrl(process.env.BACKEND_URL)) {
      errors.push('BACKEND_URL باید آدرس عمومی بک‌اند با https باشد (نه localhost)، چون زرین‌پال کاربر را به آن برمی‌گرداند.');
    }
    if (!/^https:\/\//.test(process.env.CLIENT_ORIGIN || '') || isLocalUrl(process.env.CLIENT_ORIGIN)) {
      errors.push('CLIENT_ORIGIN باید آدرس عمومی فرانت‌اند با https باشد.');
    }
    if (sandbox) warnings.push('ZARINPAL_SANDBOX=true است؛ پرداخت‌ها آزمایشی‌اند و پول واقعی جابه‌جا نمی‌شود.');

    const hasSupabaseStorage = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!hasSupabaseStorage && !process.env.UPLOAD_DIR) {
      warnings.push('نه Supabase Storage (SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY) تنظیم شده نه UPLOAD_DIR؛ فایل‌های آپلودشده با هر deploy یا راه‌اندازی دوباره‌ی سرور پاک می‌شوند.');
    }

    const brevoReady = process.env.BREVO_API_KEY && process.env.MAIL_FROM_EMAIL;
    const relayReady = process.env.MAIL_RELAY_URL && process.env.MAIL_RELAY_TOKEN;
    const smtpReady = process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD;
    if (!brevoReady && !relayReady && !smtpReady) {
      warnings.push('هیچ سرویس ایمیلی تنظیم نشده (BREVO_API_KEY و MAIL_FROM_EMAIL، یا MAIL_RELAY_URL و MAIL_RELAY_TOKEN، یا EMAIL_USER و EMAIL_APP_PASSWORD)؛ ورود و ثبت‌نام کار نمی‌کند چون کد تأیید با ایمیل می‌رود.');
    } else if (process.env.MAIL_RELAY_URL && !process.env.MAIL_RELAY_TOKEN) {
      warnings.push('MAIL_RELAY_URL هست ولی MAIL_RELAY_TOKEN تنظیم نشده؛ ایمیل‌ها ارسال نمی‌شوند.');
    } else if (process.env.BREVO_API_KEY && !process.env.MAIL_FROM_EMAIL) {
      warnings.push('BREVO_API_KEY هست ولی MAIL_FROM_EMAIL تنظیم نشده؛ ایمیل‌ها ارسال نمی‌شوند (باید یک فرستنده‌ی تأییدشده در Brevo باشد).');
    }
  }

  const adminCode = process.env.ADMIN_SETUP_CODE;
  if (adminCode && adminCode.length < 16) {
    (isProd ? errors : warnings).push('ADMIN_SETUP_CODE باید حداقل ۱۶ کاراکتر باشد، چون با آن می‌شود ادمین ساخت.');
  }

  const sameSite = String(process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
  if (isProd) {
    const client = String(process.env.CLIENT_ORIGIN || '').split(',')[0].trim();
    if (client && process.env.BACKEND_URL && registrableDomain(client) !== registrableDomain(process.env.BACKEND_URL) && sameSite !== 'none') {
      // خطا نیست چون با «بازنویسی /api در Static Site» (فرانت و API هم‌مبدأ دیده می‌شوند) همه‌چیز درست کار می‌کند
      warnings.push('فرانت و بک‌اند «دو سایت جدا» حساب می‌شوند. اگر مرورگر مستقیم به بک‌اند درخواست می‌زند، کوکی ورود ذخیره نمی‌شود. یا /api را روی Static Site به بک‌اند Rewrite کنید (VITE_API_URL=/)، یا از دامنه‌ی شخصی با دو زیردامنه استفاده کنید، یا COOKIE_SAMESITE=none بگذارید (در Safari/iPhone کار نمی‌کند).');
    }
  }

  warnings.forEach((w) => console.warn(`⚠️  ${w}`));
  if (errors.length) {
    errors.forEach((e) => console.error(`❌ ${e}`));
    console.error('سرور به‌خاطر تنظیمات بالا اجرا نشد.');
    process.exit(1);
  }
}

module.exports = checkEnv;
module.exports.registrableDomain = registrableDomain;
