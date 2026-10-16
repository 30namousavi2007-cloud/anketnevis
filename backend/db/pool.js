const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error('❌ متغیر DATABASE_URL در فایل .env تنظیم نشده است.');
  console.error('   فایل .env.example را کپی کرده و به .env تغییر نام دهید، سپس رشته‌ی اتصال دیتابیس خود را در آن بگذارید.');
}

// پارامتر sslmode را از آدرس برمی‌داریم تا فقط تنظیمات پایین تعیین‌کننده باشد
function stripSslMode(url) {
  return String(url || '')
    .replace(/([?&])sslmode=[^&]*(&|$)/, (m, p1, p2) => (p2 === '&' ? p1 : ''))
    .replace(/[?&]$/, '');
}

const connectionString = stripSslMode(process.env.DATABASE_URL);
const isLocalDatabase = /localhost|127\.0\.0\.1/.test(connectionString);

function sslConfig() {
  if (isLocalDatabase) return false;
  // بهترین حالت: گواهی ریشه‌ی دیتابیس (Supabase: Database > Settings > SSL Configuration) را در DB_SSL_CA بگذارید
  if (process.env.DB_SSL_CA) {
    return { ca: process.env.DB_SSL_CA.replace(/\\n/g, '\n'), rejectUnauthorized: true };
  }
  // اگر صریحاً true بگذارید، گواهی با CA های سیستم راستی‌آزمایی می‌شود.
  // در غیر این صورت (برای رفع خطای self-signed در Supabase pooler) راستی‌آزمایی خاموش است؛ ارتباط رمزنگاری می‌شود ولی هویت سرور چک نمی‌شود.
  const strict = String(process.env.DB_SSL_REJECT_UNAUTHORIZED || '').toLowerCase() === 'true';
  if (!strict && process.env.NODE_ENV === 'production') {
    console.warn('⚠️  اتصال دیتابیس بدون راستی‌آزمایی گواهی TLS است. برای امنیت بیشتر DB_SSL_CA را تنظیم کنید.');
  }
  return { rejectUnauthorized: strict };
}

const pool = new Pool({ connectionString, ssl: sslConfig() });

pool.on('error', (err) => {
  console.error('خطای غیرمنتظره در استخر اتصال دیتابیس:', err);
});

module.exports = pool;
module.exports.stripSslMode = stripSslMode;