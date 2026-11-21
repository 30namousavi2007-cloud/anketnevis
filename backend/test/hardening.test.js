// تست‌های مربوط به اصلاحات بعد از ممیزی: اعتبارسنجی شناسه‌ها، سقف طول بیوگرافی، و ترتیب بررسی رمز/مسدودی در ورود.
// مثل integration.test.js از دیتابیس ساختگی در حافظه استفاده می‌کند (به PostgreSQL واقعی نیاز نیست).
const path = require('path');
const bcrypt = require('bcryptjs');

process.env.JWT_SECRET = 'z'.repeat(40);
process.env.DATABASE_URL = 'postgres://u:p@localhost/db';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');

const users = {
  1: { id: 1, name: 'نویسنده', email: 'author@x.ir', role: 'author', is_blocked: false },
  4: { id: 4, name: 'ادمین', email: 'admin@x.ir', role: 'admin', is_blocked: false },
  5: { id: 5, name: 'بلاک', email: 'blocked@x.ir', role: 'reader', is_blocked: true, password_hash: bcrypt.hashSync('rightpass1', 4) },
};

const norm = (sql) => sql.replace(/\s+/g, ' ').trim();
const fakePool = {
  async query(sql, params = []) {
    const q = norm(sql);
    // مثل PostgreSQL: شناسه‌ی غیرعددی برای ستون INTEGER خطا می‌دهد
    const idParam = /WHERE id = \$(\d)/.exec(q);
    if (idParam && typeof params[Number(idParam[1]) - 1] === 'string' && !/^\d+$/.test(params[Number(idParam[1]) - 1])) {
      throw Object.assign(new Error('invalid input syntax for type integer'), { code: '22P02' });
    }
    if (/^SELECT id, name, email, role, is_blocked, password_changed_at FROM users WHERE id = \$1/.test(q)) {
      const u = users[params[0]];
      return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
    }
    if (/^SELECT \* FROM users WHERE LOWER\(email\) = \$1/.test(q)) {
      const u = Object.values(users).find((x) => x.email === params[0]);
      return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
    }
    if (/^UPDATE users SET bio = \$1 WHERE id = \$2 RETURNING/.test(q)) {
      return { rows: [{ id: params[1], name: users[params[1]].name, bio: params[0] }], rowCount: 1 };
    }
    if (/^SELECT id, name, bio, role, created_at FROM users WHERE id = \$1/.test(q)) {
      return { rows: [], rowCount: 0 };
    }
    if (/^UPDATE users SET is_blocked = false WHERE id = \$1/.test(q)) {
      return { rows: [], rowCount: 0 };
    }
    throw new Error('پرس‌وجوی پیش‌بینی‌نشده در تست: ' + q);
  },
  on() {},
  end: async () => {},
};

const poolPath = require.resolve('../db/pool');
require.cache[poolPath] = { id: poolPath, filename: poolPath, loaded: true, exports: fakePool };
const mailerPath = require.resolve('../utils/mailer');
require.cache[mailerPath] = {
  id: mailerPath, filename: mailerPath, loaded: true,
  exports: { sendOtpEmail: async () => {}, sendPrintOrderEmail: async () => {} },
};

const app = require('../server');

let server;
let base;
test.before(async () => {
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); });

const cookieFor = (userId) => `anketnevis_session=${jwt.sign({ userId }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })}`;
const post = (p, body, userId) => fetch(base + p, {
  method: 'POST',
  headers: { 'X-Requested-With': 'anketnevis', 'Content-Type': 'application/json', ...(userId ? { Cookie: cookieFor(userId) } : {}) },
  body: JSON.stringify(body || {}),
});
const put = (p, body, userId) => fetch(base + p, {
  method: 'PUT',
  headers: { 'X-Requested-With': 'anketnevis', 'Content-Type': 'application/json', ...(userId ? { Cookie: cookieFor(userId) } : {}) },
  body: JSON.stringify(body),
});

test('پروفایل نویسنده: شناسه‌ی غیرعددی ۴۰۴ می‌دهد نه ۵۰۰', async () => {
  const r = await fetch(base + '/api/authors/abc');
  assert.strictEqual(r.status, 404);
});

test('ادمین: شناسه‌ی غیرعددی در مسیرهای کاربران ۴۰۴ می‌دهد نه ۵۰۰', async () => {
  for (const p of ['/api/admin/users/abc/unblock', '/api/admin/users/abc/block', '/api/admin/users/abc/role']) {
    const r = await post(p, { role: 'author' }, 4);
    assert.strictEqual(r.status, 404, p);
  }
});

test('بیوگرافی: نوع غیررشته‌ای و متن بیش از ۲۰۰۰ کاراکتر رد می‌شود، متن معمولی ذخیره می‌شود', async () => {
  assert.strictEqual((await put('/api/authors/me', { bio: { a: 1 } }, 1)).status, 400);
  assert.strictEqual((await put('/api/authors/me', { bio: 'ب'.repeat(2001) }, 1)).status, 400);
  const ok = await put('/api/authors/me', { bio: '  درباره‌ی من  ' }, 1);
  assert.strictEqual(ok.status, 200);
  assert.strictEqual((await ok.json()).user.bio, 'درباره‌ی من');
});

test('ورود: وضعیت مسدودی فقط بعد از رمز درست فاش می‌شود (برای ایمیل‌های دیگران قابل پرسش نیست)', async () => {
  const wrong = await post('/api/auth/login', { email: 'blocked@x.ir', password: 'wrongpass1' });
  assert.strictEqual(wrong.status, 401);
  const unknown = await post('/api/auth/login', { email: 'nobody@x.ir', password: 'wrongpass1' });
  assert.strictEqual(unknown.status, 401);
  assert.deepStrictEqual(await wrong.json(), await unknown.json(), 'پیام باید برای ایمیل مسدود و ناشناس یکسان باشد');
  const right = await post('/api/auth/login', { email: 'blocked@x.ir', password: 'rightpass1' });
  assert.strictEqual(right.status, 403);
});
