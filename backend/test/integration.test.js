// تست یکپارچه‌ی مسیرهای حساس (دسترسی فایل، پرداخت، ورود، آپلود) با دیتابیس ساختگی در حافظه
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-'));
process.env.JWT_SECRET = 'y'.repeat(40);
process.env.DATABASE_URL = 'postgres://u:p@localhost/db';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.UPLOAD_DIR = UPLOAD_DIR;
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');

// ---------- دیتابیس ساختگی ----------
const users = {
  1: { id: 1, name: 'نویسنده', email: 'owner@x.ir', role: 'author', is_blocked: false },
  2: { id: 2, name: 'خریدار', email: 'buyer@x.ir', role: 'reader', is_blocked: false },
  3: { id: 3, name: 'غریبه', email: 'other@x.ir', role: 'reader', is_blocked: false },
  4: { id: 4, name: 'ادمین', email: 'admin@x.ir', role: 'admin', is_blocked: false },
  5: { id: 5, name: 'بلاک', email: 'blocked@x.ir', role: 'reader', is_blocked: true },
};
const items = {
  10: { id: 10, owner_id: 1, title: 'رایگان', price: 0, pdf_filename: 'free.pdf', audio_filename: null },
  11: { id: 11, owner_id: 1, title: 'پولی', price: 5000, pdf_filename: 'paid.pdf', audio_filename: 'paid.mp3' },
};
let orders = [];
const log = { verifyCalls: 0 };

const norm = (sql) => sql.replace(/\s+/g, ' ').trim();
const fakePool = {
  async query(sql, params = []) {
    const q = norm(sql);
    let m;
    if (/^SELECT id, name, email, role, is_blocked FROM users WHERE id = \$1/.test(q)) {
      const u = users[params[0]];
      return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
    }
    if (/^SELECT id, name, email, role FROM users WHERE id = \$1/.test(q)) {
      const u = users[params[0]];
      return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
    }
    if (/^SELECT \* FROM users WHERE LOWER\(email\) = \$1/.test(q)) {
      const u = Object.values(users).find((x) => x.email === params[0]);
      return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
    }
    if (/^UPDATE users SET otp_attempts = otp_attempts \+ 1 WHERE id = \$1 RETURNING otp_attempts/.test(q)) {
      users[params[0]].otp_attempts = (users[params[0]].otp_attempts || 0) + 1;
      return { rows: [{ otp_attempts: users[params[0]].otp_attempts }], rowCount: 1 };
    }
    if (/^UPDATE users SET otp_code = NULL, otp_expires_at = NULL, otp_attempts = 0(, email_verified = true)? WHERE id = \$1/.test(q)) {
      Object.assign(users[params[0]], { otp_code: null, otp_expires_at: null, otp_attempts: 0 });
      if (/email_verified = true/.test(q)) users[params[0]].email_verified = true;
      return { rows: [], rowCount: 1 };
    }
    if (/^SELECT id, email_verified, otp_expires_at FROM users WHERE LOWER\(email\) = \$1/.test(q)) {
      const u = Object.values(users).find((x) => x.email === params[0]);
      return { rows: u ? [{ id: u.id, email_verified: u.email_verified !== false, otp_expires_at: u.otp_expires_at }] : [], rowCount: u ? 1 : 0 };
    }
    if (/^INSERT INTO users \(name, email, password_hash, email_verified, otp_code, otp_expires_at, otp_attempts\)/.test(q)) {
      const id = 100 + Object.keys(users).length;
      users[id] = { id, name: params[0], email: params[1], password_hash: params[2], role: 'reader', is_blocked: false, email_verified: false, otp_code: params[3], otp_expires_at: params[4], otp_attempts: 0 };
      return { rows: [users[id]], rowCount: 1 };
    }
    if (/^UPDATE users SET name = \$1, password_hash = \$2, otp_code = \$3, otp_expires_at = \$4, otp_attempts = 0 WHERE id = \$5/.test(q)) {
      Object.assign(users[params[4]], { name: params[0], password_hash: params[1], otp_code: params[2], otp_expires_at: params[3], otp_attempts: 0 });
      return { rows: [], rowCount: 1 };
    }
    if (/^UPDATE users SET otp_code = NULL, otp_expires_at = NULL WHERE id = \$1/.test(q)) {
      Object.assign(users[params[0]], { otp_code: null, otp_expires_at: null });
      return { rows: [], rowCount: 1 };
    }
    if ((m = /^SELECT id, owner_id, price, (\w+) FROM items WHERE id = \$1/.exec(q)) || /^SELECT \* FROM items WHERE id = \$1/.test(q)) {
      const it = items[params[0]];
      return { rows: it ? [{ ...it }] : [], rowCount: it ? 1 : 0 };
    }
    if ((m = /^SELECT (\w+) AS filename FROM items WHERE id = \$1/.exec(q))) {
      const it = items[params[0]];
      return { rows: it ? [{ filename: it[m[1]] }] : [], rowCount: it ? 1 : 0 };
    }
    if (/^SELECT 1 FROM orders WHERE buyer_id = \$1 AND item_id = \$2/.test(q)) {
      const hit = orders.filter((o) => o.buyer_id === params[0] && o.item_id === params[1] && o.kind === 'digital' && o.status === 'paid');
      return { rows: hit.map(() => ({ '?column?': 1 })), rowCount: hit.length };
    }
    if (/^UPDATE items SET pdf_filename = COALESCE/.test(q)) {
      const it = items[params[2]];
      if (params[0]) it.pdf_filename = params[0];
      if (params[1]) it.audio_filename = params[1];
      return { rows: [{ ...it }], rowCount: 1 };
    }
    if (/^SELECT \* FROM orders WHERE authority = \$1/.test(q)) {
      const o = orders.find((x) => x.authority === params[0]);
      return { rows: o ? [o] : [], rowCount: o ? 1 : 0 };
    }
    if (/^UPDATE orders SET status = 'failed' WHERE id = \$1/.test(q)) {
      const o = orders.find((x) => x.id === params[0]);
      if (o && (!/AND status = 'pending'/.test(q) || o.status === 'pending')) o.status = 'failed';
      return { rows: [], rowCount: 1 };
    }
    if (/^UPDATE orders SET status = 'paid', ref_id = \$2, paid_at = now\(\) WHERE id = \$1 AND status = 'pending' RETURNING \*/.test(q)) {
      const o = orders.find((x) => x.id === params[0]);
      if (!o || o.status !== 'pending') return { rows: [], rowCount: 0 };
      Object.assign(o, { status: 'paid', ref_id: String(params[1]) });
      return { rows: [o], rowCount: 1 };
    }
    if (/^SELECT DISTINCT email FROM users/.test(q) || /^SELECT name, email FROM users WHERE id = \$1/.test(q)) {
      return { rows: [], rowCount: 0 };
    }
    throw new Error('کوئری پیش‌بینی‌نشده در تست: ' + q);
  },
  on() {},
  end() {},
};
const poolPath = require.resolve('../db/pool');
require.cache[poolPath] = { id: poolPath, filename: poolPath, loaded: true, exports: fakePool };

const sentMails = [];
const mailerPath = require.resolve('../utils/mailer');
require.cache[mailerPath] = {
  id: mailerPath,
  filename: mailerPath,
  loaded: true,
  exports: {
    sendOtpEmail: async (to, code, purpose) => { sentMails.push({ to, code, purpose }); },
    sendPrintOrderEmail: async () => {},
  },
};

const zarinpal = require('../utils/zarinpal');
const app = require('../server');

let server;
let base;
test.before(async () => {
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, 'free.pdf'), '%PDF-1.4 free');
  fs.writeFileSync(path.join(UPLOAD_DIR, 'paid.pdf'), '%PDF-1.4 paid');
  fs.writeFileSync(path.join(UPLOAD_DIR, 'paid.mp3'), Buffer.concat([Buffer.from('ID3'), Buffer.alloc(30)]));
});
test.after(() => { server.close(); fs.rmSync(UPLOAD_DIR, { recursive: true, force: true }); });

const cookieFor = (userId) => `anketnevis_session=${jwt.sign({ userId }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })}`;
const csrf = { 'X-Requested-With': 'anketnevis', 'Content-Type': 'application/json' };
const get = (p, userId) => fetch(base + p, { headers: userId ? { Cookie: cookieFor(userId) } : {} });
const uploadsEmpty = () => fs.readdirSync(UPLOAD_DIR).filter((f) => !['free.pdf', 'paid.pdf', 'paid.mp3'].includes(f)).length === 0;

// ======================= احراز هویت و CSRF =======================
test('بدون کوکی نشست، لینک فایل ۴۰۱ است؛ توکن در هدر Authorization هم قبول نمی‌شود', async () => {
  assert.strictEqual((await get('/api/items/10/file-url/pdf')).status, 401);
  const token = cookieFor(2).split('=')[1];
  const r = await fetch(base + '/api/items/10/file-url/pdf', { headers: { Authorization: `Bearer ${token}` } });
  assert.strictEqual(r.status, 401);
});

test('کاربر بلاک‌شده و توکن جعلی/الگوریتم none رد می‌شوند', async () => {
  assert.strictEqual((await get('/api/items/10/file-url/pdf', 5)).status, 403);
  const none = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url') + '.' + Buffer.from('{"userId":4}').toString('base64url') + '.';
  const r = await fetch(base + '/api/items/10/file-url/pdf', { headers: { Cookie: `anketnevis_session=${none}` } });
  assert.strictEqual(r.status, 401);
  const forged = jwt.sign({ userId: 4 }, 'wrong-secret-wrong-secret-wrong-secret!!');
  const r2 = await fetch(base + '/api/items/10/file-url/pdf', { headers: { Cookie: `anketnevis_session=${forged}` } });
  assert.strictEqual(r2.status, 401);
});

test('CSRF: درخواست POST بدون هدر سفارشی یا از مبدأ بیگانه ۴۰۳ است', async () => {
  const body = JSON.stringify({ itemId: 11, kind: 'digital' });
  let r = await fetch(base + '/api/payments/checkout', { method: 'POST', headers: { Cookie: cookieFor(2), 'Content-Type': 'application/json' }, body });
  assert.strictEqual(r.status, 403);
  r = await fetch(base + '/api/payments/checkout', { method: 'POST', headers: { ...csrf, Cookie: cookieFor(2), Origin: 'https://evil.example' }, body });
  assert.strictEqual(r.status, 403);
});

test('هدرهای امنیتی روی پاسخ‌ها هست', async () => {
  const r = await get('/api/health');
  assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');
  assert.strictEqual(r.headers.get('x-powered-by'), null);
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors http:\/\/localhost:5173/);
  assert.strictEqual(r.headers.get('cache-control'), 'no-store');
});

test('CORS فقط برای مبدأ مجاز با credentials است', async () => {
  const ok = await fetch(base + '/api/health', { headers: { Origin: 'http://localhost:5173' } });
  assert.strictEqual(ok.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.strictEqual(ok.headers.get('access-control-allow-credentials'), 'true');
  const bad = await fetch(base + '/api/health', { headers: { Origin: 'https://evil.example' } });
  assert.strictEqual(bad.headers.get('access-control-allow-origin'), null);
});

// ======================= دسترسی به فایل‌ها =======================
test('اثر رایگان برای هر کاربر واردشده لینک می‌دهد و فایل با لینک پخش می‌شود', async () => {
  const r = await get('/api/items/10/file-url/pdf', 3);
  assert.strictEqual(r.status, 200);
  const { url } = await r.json();
  const file = await fetch(base + url);
  assert.strictEqual(file.status, 200);
  assert.strictEqual(file.headers.get('content-type'), 'application/pdf');
  assert.strictEqual(await file.text(), '%PDF-1.4 free');
});

test('اثر پولی: غریبه ۴۰۳، خریدار/صاحب/ادمین ۲۰۰', async () => {
  assert.strictEqual((await get('/api/items/11/file-url/pdf', 3)).status, 403);
  assert.strictEqual((await get('/api/items/11/file-url/audio', 3)).status, 403);
  assert.strictEqual((await get('/api/items/11/file-url/pdf', 1)).status, 200, 'صاحب');
  assert.strictEqual((await get('/api/items/11/file-url/pdf', 4)).status, 200, 'ادمین');

  assert.strictEqual((await get('/api/items/11/file-url/pdf', 2)).status, 403, 'خریدار هنوز نخریده');
  orders.push({ id: 100, item_id: 11, buyer_id: 2, kind: 'digital', status: 'paid' });
  const r = await get('/api/items/11/file-url/audio', 2);
  assert.strictEqual(r.status, 200);
  const file = await fetch(base + (await r.json()).url, { headers: { Range: 'bytes=0-2' } });
  assert.strictEqual(file.status, 206);
  assert.strictEqual(file.headers.get('content-type'), 'audio/mpeg');
  assert.strictEqual(await file.text(), 'ID3');
  orders = [];
});

test('خرید نسخه‌ی چاپی یا پرداخت‌نشده دسترسی به فایل نمی‌دهد', async () => {
  orders.push({ id: 101, item_id: 11, buyer_id: 3, kind: 'print', status: 'paid' });
  orders.push({ id: 102, item_id: 11, buyer_id: 3, kind: 'digital', status: 'pending' });
  assert.strictEqual((await get('/api/items/11/file-url/pdf', 3)).status, 403);
  orders = [];
});

test('پخش مستقیم بدون امضا، با امضای جعلی یا منقضی ۴۰۳ است (حتی برای اثر رایگان)', async () => {
  assert.strictEqual((await get('/api/items/11/stream/pdf')).status, 403);
  assert.strictEqual((await get('/api/items/11/stream/pdf?exp=9999999999&sig=abc')).status, 403);
  assert.strictEqual((await get('/api/items/10/stream/pdf', 1)).status, 403, 'کوکی به‌تنهایی کافی نیست');
  const { createSignedPath } = require('../utils/signedUrl');
  assert.strictEqual((await get(createSignedPath(11, 'pdf', -5))).status, 403, 'منقضی');
  // امضای اثر ۱۰ روی اثر ۱۱ کار نکند
  const sig = new URL('http://x' + createSignedPath(10, 'pdf'));
  assert.strictEqual((await get(`/api/items/11/stream/pdf${sig.search}`)).status, 403);
});

test('شناسه‌ی غیرعددی ۴۰۴ می‌دهد نه ۵۰۰', async () => {
  assert.strictEqual((await get('/api/items/abc/file-url/pdf', 2)).status, 404);
  assert.strictEqual((await get("/api/items/1;DROP TABLE users")).status, 404);
});

// ======================= آپلود =======================
function pdfForm(content, type = 'application/pdf') {
  const fd = new FormData();
  fd.append('pdf', new Blob([content], { type }), 'book.pdf');
  return fd;
}

test('آپلود: غیرمالک ۴۰۳ و هیچ فایلی روی دیسک نمی‌ماند', async () => {
  const r = await fetch(base + '/api/items/11/files', { method: 'POST', headers: { 'X-Requested-With': 'anketnevis', Cookie: cookieFor(3) }, body: pdfForm('%PDF-1.4 x') });
  assert.strictEqual(r.status, 403);
  assert.ok(uploadsEmpty());
});

test('آپلود: فایل جعلی با پسوند و نوع PDF رد و پاک می‌شود', async () => {
  const r = await fetch(base + '/api/items/11/files', { method: 'POST', headers: { 'X-Requested-With': 'anketnevis', Cookie: cookieFor(1) }, body: pdfForm('<script>alert(1)</script>') });
  assert.strictEqual(r.status, 400);
  assert.ok(uploadsEmpty(), 'فایل جعلی باید پاک شده باشد');
  assert.strictEqual(items[11].pdf_filename, 'paid.pdf', 'اثر تغییر نکرده');
});

test('آپلود: PDF واقعی ذخیره می‌شود و فایل قدیمی پاک می‌شود', async () => {
  const r = await fetch(base + '/api/items/11/files', { method: 'POST', headers: { 'X-Requested-With': 'anketnevis', Cookie: cookieFor(1) }, body: pdfForm('%PDF-1.4 new-version') });
  assert.strictEqual(r.status, 200);
  assert.notStrictEqual(items[11].pdf_filename, 'paid.pdf');
  assert.ok(fs.existsSync(path.join(UPLOAD_DIR, items[11].pdf_filename)), 'فایل جدید روی دیسک باشد');
  // حذف فایل قدیمی در پس‌زمینه انجام می‌شود؛ کمی صبر می‌کنیم
  for (let i = 0; i < 20 && fs.existsSync(path.join(UPLOAD_DIR, 'paid.pdf')); i += 1) await new Promise((r2) => setTimeout(r2, 25));
  assert.ok(!fs.existsSync(path.join(UPLOAD_DIR, 'paid.pdf')), 'فایل قدیمی حذف شود');
});

// ======================= ورود با کد تأیید =======================
const hashOtp = (code) => crypto.createHmac('sha256', process.env.JWT_SECRET).update(`otp:${code}`).digest('hex');

test('کد تأیید: بعد از ۵ حدس اشتباه، حتی کد درست هم کار نمی‌کند', async () => {
  Object.assign(users[2], { otp_code: hashOtp('123456'), otp_expires_at: new Date(Date.now() + 60000), otp_attempts: 0 });
  const verify = (code) => fetch(base + '/api/auth/verify-otp', { method: 'POST', headers: csrf, body: JSON.stringify({ email: 'buyer@x.ir', code }) });
  for (let i = 0; i < 5; i += 1) assert.strictEqual((await verify('000000')).status, 400);
  const sixth = await verify('123456');
  assert.strictEqual(sixth.status, 429);
  assert.strictEqual(users[2].otp_code, null, 'کد باطل شده');
});

test('کد تأیید درست: کوکی httpOnly می‌دهد و توکن در بدنه نیست', async () => {
  Object.assign(users[2], { otp_code: hashOtp('654321'), otp_expires_at: new Date(Date.now() + 60000), otp_attempts: 0 });
  const r = await fetch(base + '/api/auth/verify-otp', { method: 'POST', headers: csrf, body: JSON.stringify({ email: 'buyer@x.ir', code: '654321' }) });
  assert.strictEqual(r.status, 200);
  const body = await r.json();
  assert.strictEqual(body.token, undefined);
  assert.strictEqual(body.user.email, 'buyer@x.ir');
  const cookie = r.headers.get('set-cookie');
  assert.match(cookie, /^anketnevis_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  // کوکی گرفته‌شده واقعاً کار می‌کند
  const me = await fetch(base + '/api/auth/me', { headers: { Cookie: cookie.split(';')[0] } });
  assert.strictEqual(me.status, 200);
  // خروج کوکی را پاک می‌کند
  const out = await fetch(base + '/api/auth/logout', { method: 'POST', headers: csrf });
  assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
});

test('ارسال دوباره‌ی کد برای ایمیل ناشناس همان پاسخ ایمیل موجود را می‌دهد (بدون افشای حساب‌ها)', async () => {
  const send = (email) => fetch(base + '/api/auth/resend-otp', { method: 'POST', headers: csrf, body: JSON.stringify({ email }) });
  const unknown = await send('nobody@x.ir');
  assert.strictEqual(unknown.status, 200);
  assert.deepStrictEqual(await unknown.json(), { sent: true });
});

test('ثبت‌نام: رمز کوتاه‌تر از ۸ کاراکتر رد می‌شود', async () => {
  const r = await fetch(base + '/api/auth/register', { method: 'POST', headers: csrf, body: JSON.stringify({ name: 'تست', email: 'new@x.ir', password: '1234567' }) });
  assert.strictEqual(r.status, 400);
});

// ======================= پرداخت =======================
const callback = (authority, status = 'OK') => fetch(`${base}/api/payments/callback?Authority=${authority}&Status=${status}`, { redirect: 'manual' });
const newOrder = (over) => {
  const o = { id: 200 + orders.length, item_id: 11, item_title: 'پولی', seller_id: 1, buyer_id: 2, kind: 'digital', amount: 5000, status: 'pending', authority: 'A' + (orders.length + 1).toString().padStart(35, '0'), ...over };
  orders.push(o);
  return o;
};

test('پرداخت موفق: فقط یک‌بار از زرین‌پال verify می‌شود و رفرش دوباره verify نمی‌کند', async () => {
  const order = newOrder({});
  zarinpal.verifyPayment = async () => { log.verifyCalls += 1; return { ok: true, refId: 777 }; };
  const r1 = await callback(order.authority);
  assert.strictEqual(r1.status, 302);
  assert.match(r1.headers.get('location'), /payment=ok/);
  assert.strictEqual(order.status, 'paid');
  assert.strictEqual(order.ref_id, '777');
  const r2 = await callback(order.authority);
  assert.match(r2.headers.get('location'), /payment=ok/);
  assert.strictEqual(log.verifyCalls, 1);
  orders = [];
});

test('پرداخت هم‌زمان (دو callback همزمان): سفارش فقط یک‌بار paid می‌شود', async () => {
  const order = newOrder({ kind: 'print' });
  zarinpal.verifyPayment = async () => { await new Promise((r) => setTimeout(r, 20)); return { ok: true, refId: 888 }; };
  const [a, b] = await Promise.all([callback(order.authority), callback(order.authority)]);
  assert.match(a.headers.get('location'), /payment=ok/);
  assert.match(b.headers.get('location'), /payment=ok/);
  assert.strictEqual(order.status, 'paid');
  orders = [];
});

test('Status=NOK یا verify ناموفق: سفارش failed می‌شود و فایل باز نمی‌شود', async () => {
  const o1 = newOrder({});
  const r1 = await callback(o1.authority, 'NOK');
  assert.match(r1.headers.get('location'), /payment=failed/);
  assert.strictEqual(o1.status, 'failed');

  const o2 = newOrder({});
  zarinpal.verifyPayment = async () => ({ ok: false });
  const r2 = await callback(o2.authority);
  assert.match(r2.headers.get('location'), /payment=failed/);
  assert.strictEqual(o2.status, 'failed');
  assert.strictEqual((await get('/api/items/11/file-url/pdf', 2)).status, 403);
  orders = [];
});

test('authority ناشناخته: بدون فراخوانی زرین‌پال به صفحه‌ی خطا می‌رود', async () => {
  const before = log.verifyCalls;
  const r = await callback('Aunknown');
  assert.match(r.headers.get('location'), /payment=failed/);
  assert.strictEqual(log.verifyCalls, before);
});

test('خرید اثر خودِ نویسنده، و خرید نسخه‌ی چاپی بدون اطلاعات ارسال رد می‌شود', async () => {
  let r = await fetch(base + '/api/payments/checkout', { method: 'POST', headers: { ...csrf, Cookie: cookieFor(1) }, body: JSON.stringify({ itemId: 11, kind: 'digital' }) });
  assert.strictEqual(r.status, 400);
  items[11].print_price = 20000;
  r = await fetch(base + '/api/payments/checkout', { method: 'POST', headers: { ...csrf, Cookie: cookieFor(3) }, body: JSON.stringify({ itemId: 11, kind: 'print', shipping: { name: 'علی', address: 'کوتاه', phone: '123' } }) });
  assert.strictEqual(r.status, 400);
});

test('محدودیت درخواست ورود: بعد از ۱۰ تلاش ۴۲۹ می‌شود', async () => {
  const attempt = () => fetch(base + '/api/auth/login', { method: 'POST', headers: csrf, body: JSON.stringify({ email: 'nobody@x.ir', password: 'wrongpass' }) });
  let last;
  for (let i = 0; i < 11; i += 1) last = await attempt();
  assert.strictEqual(last.status, 429);
  assert.ok(Number(last.headers.get('retry-after')) > 0);
});

// ======================= تأیید ایمیل در ثبت‌نام =======================
const register = (body) => fetch(base + '/api/auth/register', { method: 'POST', headers: csrf, body: JSON.stringify(body) });
const newUserBody = { name: 'کاربر جدید', email: 'fresh@x.ir', password: 'password123' };

test('ثبت‌نام: بدون کد ایمیل نشستی داده نمی‌شود، ایمیل تأیید می‌رود', async () => {
  const mailsBefore = sentMails.length;
  const r = await register(newUserBody);
  assert.strictEqual(r.status, 201);
  const body = await r.json();
  assert.deepStrictEqual(body, { requiresOtp: true, email: 'fresh@x.ir' });
  assert.strictEqual(r.headers.get('set-cookie'), null, 'قبل از تأیید کوکی نباید داده شود');
  const user = Object.values(users).find((u) => u.email === 'fresh@x.ir');
  assert.strictEqual(user.email_verified, false);
  assert.notStrictEqual(user.password_hash, 'password123', 'رمز هش شده ذخیره شود');
  assert.strictEqual(sentMails.length, mailsBefore + 1);
  const mail = sentMails[sentMails.length - 1];
  assert.strictEqual(mail.to, 'fresh@x.ir');
  assert.strictEqual(mail.purpose, 'register');
  assert.match(mail.code, /^\d{6}$/);
  assert.notStrictEqual(user.otp_code, mail.code, 'کد به‌صورت هش ذخیره شود');
});

test('ثبت‌نام: با کد ایمیل تأیید می‌شود و بعد وارد می‌شود', async () => {
  const mail = [...sentMails].reverse().find((m) => m.to === 'fresh@x.ir');
  const wrong = await fetch(base + '/api/auth/verify-otp', { method: 'POST', headers: csrf, body: JSON.stringify({ email: 'fresh@x.ir', code: '000000' }) });
  assert.strictEqual(wrong.status, 400);
  const r = await fetch(base + '/api/auth/verify-otp', { method: 'POST', headers: csrf, body: JSON.stringify({ email: 'fresh@x.ir', code: mail.code }) });
  assert.strictEqual(r.status, 200);
  assert.match(r.headers.get('set-cookie'), /^anketnevis_session=.*HttpOnly/);
  const user = Object.values(users).find((u) => u.email === 'fresh@x.ir');
  assert.strictEqual(user.email_verified, true);
});

test('ثبت‌نام دوباره با ایمیل تأییدشده ۴۰۹ است', async () => {
  const r = await register(newUserBody);
  assert.strictEqual(r.status, 409);
});

test('ثبت‌نام تأییدنشده: در ۶۰ ثانیه‌ی اول چیزی عوض نمی‌شود، بعدش حساب بازنویسی و کد تازه فرستاده می‌شود', async () => {
  const body = { name: 'نیمه‌کاره', email: 'pending@x.ir', password: 'firstpassword' };
  assert.strictEqual((await register(body)).status, 201);
  const user = Object.values(users).find((u) => u.email === 'pending@x.ir');
  const firstHash = user.password_hash;
  const mailsAfterFirst = sentMails.length;

  // تلاش دوباره‌ی فوری (مثلاً مهاجم): نه رمز عوض می‌شود نه ایمیل جدید می‌رود
  const again = await register({ ...body, password: 'attackerpass1' });
  assert.strictEqual(again.status, 201);
  assert.strictEqual(user.password_hash, firstHash);
  assert.strictEqual(sentMails.length, mailsAfterFirst);

  // بعد از گذشت زمان، همان کاربر می‌تواند اشتباهش را درست کند
  user.otp_expires_at = new Date(Date.now() - 10 * 60 * 1000);
  const later = await register({ ...body, name: 'نام درست', password: 'secondpassword' });
  assert.strictEqual(later.status, 201);
  assert.strictEqual(user.name, 'نام درست');
  assert.notStrictEqual(user.password_hash, firstHash);
  assert.strictEqual(sentMails.length, mailsAfterFirst + 1);
});

test('ثبت‌نام: ورودی نامعتبر رد می‌شود', async () => {
  assert.strictEqual((await register({ name: 'x', email: 'not-an-email', password: 'password123' })).status, 400);
  assert.strictEqual((await register({ name: '', email: 'a@x.ir', password: 'password123' })).status, 400);
  assert.strictEqual((await register({ name: 'x', email: 'a@x.ir', password: 123456789 })).status, 400);
});
