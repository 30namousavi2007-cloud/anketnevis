const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error('❌ متغیر DATABASE_URL در فایل .env تنظیم نشده است.');
  console.error('   فایل .env.example را کپی کرده و به .env تغییر نام دهید، سپس رشته‌ی اتصال دیتابیس خود را در آن بگذارید.');
}

// پارامتر sslmode را از آدرس برمی‌داریم تا فقط تنظیمات پایین (متغیرهای محیطی) تعیین‌کننده باشد
function stripSslMode(url) {
  return String(url || '')
    .replace(/([?&])sslmode=[^&]*(&|$)/, (m, p1, p2) => (p2 === '&' ? p1 : ''))
    .replace(/[?&]$/, '');
}

const connectionString = stripSslMode(process.env.DATABASE_URL);
const isLocalDatabase = /localhost|127\.0\.0\.1/.test(connectionString);

// اتصال به دیتابیس ابری همیشه با TLS است.
//  - در production گواهی سرور دیتابیس راستی‌آزمایی می‌شود (جلوی حمله‌ی مردِ میانی را می‌گیرد).
//  - اگر سرویس شما گواهی خودامضا دارد: گواهی ریشه‌اش را در DB_SSL_CA بگذارید،
//    یا (کم‌امن‌تر) DB_SSL_REJECT_UNAUTHORIZED=false.
function sslConfig() {
  if (isLocalDatabase) return false;
  if (process.env.DB_SSL_CA) {
    return { ca: process.env.DB_SSL_CA.replace(/\\n/g, '\n'), rejectUnauthorized: true };
  }
  const explicit = process.env.DB_SSL_REJECT_UNAUTHORIZED;
  const reject = explicit !== undefined && explicit !== ''
    ? String(explicit).toLowerCase() !== 'false'
    : process.env.NODE_ENV === 'production';
  return { rejectUnauthorized: reject };
}

// دیتابیس رایگان تعداد اتصال محدودی دارد؛ استخر کوچک و با مهلت زمانی تا خطاها آویزان نمانند
const pool = new Pool({
  connectionString,
  ssl: sslConfig(),
  max: Number(process.env.DB_POOL_MAX) || 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

pool.on('error', (err) => {
  console.error('خطای غیرمنتظره در استخر اتصال دیتابیس:', err);
});

module.exports = pool;
module.exports.stripSslMode = stripSslMode;
