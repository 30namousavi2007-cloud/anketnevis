// بررسی تنظیمات هنگام اجرا. در حالت production اگر تنظیمات ناامن یا ناقص باشد، سرور بالا نمی‌آید
// تا اشتباهی با کلید آزمایشی یا آدرس localhost پول واقعی دریافت نشود.
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
    if (!process.env.UPLOAD_DIR) warnings.push('UPLOAD_DIR تنظیم نشده؛ اگر دیسک سرور دائمی نیست، فایل‌های آپلودشده با هر دیپلوی پاک می‌شوند.');
  }

  const adminCode = process.env.ADMIN_SETUP_CODE;
  if (adminCode && adminCode.length < 16) {
    (isProd ? errors : warnings).push('ADMIN_SETUP_CODE باید حداقل ۱۶ کاراکتر باشد، چون با آن می‌شود ادمین ساخت.');
  }

  const sameSite = String(process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
  if (isProd) {
    // دامنه‌هایی مثل onrender.com در فهرست Public Suffix هستند؛ دو زیردامنه‌ی آن‌ها «دو سایت جدا» حساب می‌شوند
    const PUBLIC_SUFFIXES = ['onrender.com', 'vercel.app', 'netlify.app', 'pages.dev', 'github.io', 'herokuapp.com', 'up.railway.app', 'fly.dev', 'web.app', 'firebaseapp.com'];
    const site = (u) => {
      try {
        const host = new URL(u).hostname;
        const suffix = PUBLIC_SUFFIXES.find((s) => host === s || host.endsWith('.' + s));
        if (suffix) return host.split('.').slice(-(suffix.split('.').length + 1)).join('.');
        return host.split('.').slice(-2).join('.');
      } catch (_) { return ''; }
    };
    const client = String(process.env.CLIENT_ORIGIN || '').split(',')[0].trim();
    if (site(client) && site(process.env.BACKEND_URL) && site(client) !== site(process.env.BACKEND_URL) && sameSite !== 'none') {
      errors.push('فرانت و بک‌اند روی دو دامنه‌ی جدا هستند؛ کوکی ورود کار نمی‌کند. بهتر است هر دو زیردامنه‌ی یک دامنه باشند (مثل app.example.ir و api.example.ir)، وگرنه COOKIE_SAMESITE=none بگذارید.');
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
