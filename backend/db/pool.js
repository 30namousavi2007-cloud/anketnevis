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
  if (process.env.DB_SSL_CA) {
    return { ca: process.env.DB_SSL_CA.replace(/\\n/g, '\n'), rejectUnauthorized: true };
  }
  // برای اینکه خطای گواهی خودامضای Supabase برطرف شود، rejectUnauthorized را به صورت پیش‌فرض false می‌گذاریم
  return { rejectUnauthorized: false };
}

const pool = new Pool({ connectionString, ssl: sslConfig() });

pool.on('error', (err) => {
  console.error('خطای غیرمنتظره در استخر اتصال دیتابیس:', err);
});

module.exports = pool;
module.exports.stripSslMode = stripSslMode;