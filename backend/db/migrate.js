const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('✅ ساختار دیتابیس با موفقیت اعمال شد.');
  } catch (err) {
    console.error('❌ خطا در اجرای migration:', err.message);
    if (/self[- ]signed|unable to verify|certificate/i.test(err.message)) {
      console.error('   خطای گواهی TLS دیتابیس: گواهی ریشه را در DB_SSL_CA بگذارید یا موقتاً DB_SSL_REJECT_UNAUTHORIZED=false تنظیم کنید.');
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
