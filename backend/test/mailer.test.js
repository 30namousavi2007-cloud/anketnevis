process.env.UPLOAD_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'mail-'));
const test = require('node:test');
const assert = require('node:assert');

const realFetch = global.fetch;
test.afterEach(() => { global.fetch = realFetch; });

function mockFetch(handler) {
  const calls = [];
  global.fetch = async (url, opts) => { calls.push({ url, opts, body: opts?.body ? JSON.parse(opts.body) : null }); return handler(url, opts); };
  return calls;
}

test('با BREVO_API_KEY ایمیل از طریق API وب Brevo (HTTPS) فرستاده می‌شود', async () => {
  process.env.BREVO_API_KEY = 'test-key-123';
  process.env.MAIL_FROM_EMAIL = 'noreply@example.ir';
  process.env.MAIL_FROM_NAME = 'آنکت‌نویس';
  const calls = mockFetch(async () => ({ ok: true, status: 201, json: async () => ({ messageId: 'x' }) }));
  const { sendOtpEmail } = require('../utils/mailer');
  await sendOtpEmail('user@x.ir', '123456', 'register');
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, 'https://api.brevo.com/v3/smtp/email');
  assert.strictEqual(calls[0].opts.headers['api-key'], 'test-key-123');
  assert.deepStrictEqual(calls[0].body.to, [{ email: 'user@x.ir' }]);
  assert.strictEqual(calls[0].body.sender.email, 'noreply@example.ir');
  assert.match(calls[0].body.subject, /کد تأیید ایمیل/);
  assert.match(calls[0].body.subject, /123456/);
  assert.match(calls[0].body.htmlContent, /123456/);
});

test('عنوان ایمیل بر اساس هدف: ورود، تأیید ثبت‌نام، بازیابی رمز', async () => {
  process.env.BREVO_API_KEY = 'k';
  process.env.MAIL_FROM_EMAIL = 'noreply@example.ir';
  const calls = mockFetch(async () => ({ ok: true, status: 201 }));
  const { sendOtpEmail } = require('../utils/mailer');
  await sendOtpEmail('a@x.ir', '111111');
  await sendOtpEmail('a@x.ir', '222222', 'reset');
  assert.match(calls[0].body.subject, /کد ورود/);
  assert.match(calls[1].body.subject, /کد بازیابی رمز عبور/);
});

test('سفارش چاپی به چند گیرنده می‌رود و متن کاربر escape می‌شود', async () => {
  process.env.BREVO_API_KEY = 'k';
  process.env.MAIL_FROM_EMAIL = 'noreply@example.ir';
  const calls = mockFetch(async () => ({ ok: true, status: 201 }));
  const { sendPrintOrderEmail } = require('../utils/mailer');
  await sendPrintOrderEmail(['author@x.ir', 'admin@x.ir'], { item_title: 'کتاب', amount: 50000, ref_id: '77', ship_name: '<b>علی</b>', ship_address: 'تهران', ship_phone: '0912' }, { name: 'خریدار', email: 'b@x.ir' });
  assert.deepStrictEqual(calls[0].body.to, [{ email: 'author@x.ir' }, { email: 'admin@x.ir' }]);
  assert.doesNotMatch(calls[0].body.htmlContent, /<b>علی<\/b>/);
  assert.match(calls[0].body.htmlContent, /&lt;b&gt;/);
});

test('خطای Brevo پیام روشن (بدون کلید) می‌دهد و بدون گیرنده چیزی فرستاده نمی‌شود', async () => {
  process.env.BREVO_API_KEY = 'secret-key-should-not-leak';
  process.env.MAIL_FROM_EMAIL = 'noreply@example.ir';
  mockFetch(async () => ({ ok: false, status: 401, json: async () => ({ message: 'Key not found' }) }));
  const { sendOtpEmail, sendPrintOrderEmail } = require('../utils/mailer');
  await assert.rejects(() => sendOtpEmail('a@x.ir', '123456'), (err) => {
    assert.match(err.message, /Brevo API 401: Key not found/);
    assert.doesNotMatch(err.message, /secret-key-should-not-leak/);
    return true;
  });
  const calls = mockFetch(async () => ({ ok: true, status: 201 }));
  await sendPrintOrderEmail([], { item_title: 'x', amount: 1 }, {});
  assert.strictEqual(calls.length, 0);
});

test('بدون MAIL_FROM_EMAIL و EMAIL_USER خطای روشن می‌دهد', async () => {
  process.env.BREVO_API_KEY = 'k';
  delete process.env.MAIL_FROM_EMAIL;
  delete process.env.EMAIL_USER;
  mockFetch(async () => ({ ok: true, status: 201 }));
  const { sendOtpEmail } = require('../utils/mailer');
  await assert.rejects(() => sendOtpEmail('a@x.ir', '123456'), /MAIL_FROM_EMAIL/);
});

// ======================= رله‌ی Google Apps Script =======================
function relayEnv() {
  delete process.env.BREVO_API_KEY;
  process.env.MAIL_RELAY_URL = 'https://script.google.com/macros/s/ABC/exec';
  process.env.MAIL_RELAY_TOKEN = 'relay-secret';
  process.env.MAIL_FROM_NAME = 'آنکت‌نویس';
}

test('رله: ایمیل با توکن و گیرنده‌ها به آدرس Apps Script فرستاده می‌شود', async () => {
  relayEnv();
  const calls = mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }));
  const { sendOtpEmail, sendPrintOrderEmail } = require('../utils/mailer');
  await sendOtpEmail('user@x.ir', '123456', 'reset');
  assert.strictEqual(calls[0].url, 'https://script.google.com/macros/s/ABC/exec');
  assert.strictEqual(calls[0].opts.method, 'POST');
  assert.strictEqual(calls[0].opts.redirect, 'follow');
  assert.strictEqual(calls[0].body.token, 'relay-secret');
  assert.strictEqual(calls[0].body.to, 'user@x.ir');
  assert.match(calls[0].body.subject, /کد بازیابی رمز عبور/);
  assert.match(calls[0].body.html, /123456/);

  await sendPrintOrderEmail(['a@x.ir', 'b@x.ir'], { item_title: 'کتاب', amount: 1000, ref_id: '1', ship_name: 'علی', ship_address: 'تهران', ship_phone: '0912' }, { name: 'خریدار' });
  assert.strictEqual(calls[1].body.to, 'a@x.ir,b@x.ir');
});

test('رله: Brevo اولویت دارد؛ خطای رله (مثلاً پر شدن سقف روزانه) پیام روشن می‌دهد', async () => {
  relayEnv();
  process.env.BREVO_API_KEY = 'k';
  process.env.MAIL_FROM_EMAIL = 'noreply@example.ir';
  const calls = mockFetch(async () => ({ ok: true, status: 201 }));
  const { sendOtpEmail } = require('../utils/mailer');
  await sendOtpEmail('a@x.ir', '111111');
  assert.strictEqual(calls[0].url, 'https://api.brevo.com/v3/smtp/email');

  relayEnv();
  mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ ok: false, error: 'Service invoked too many times' }) }));
  await assert.rejects(() => sendOtpEmail('a@x.ir', '222222'), /Service invoked too many times/);
  mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ ok: false, error: 'unauthorized' }) }));
  await assert.rejects(() => sendOtpEmail('a@x.ir', '333333'), /unauthorized/);
  mockFetch(async () => ({ ok: false, status: 500, json: async () => { throw new Error('html'); } }));
  await assert.rejects(() => sendOtpEmail('a@x.ir', '444444'), /رله‌ی ایمیل ناموفق بود \(500\)/);
});

test('رله: بدون توکن خطای روشن می‌دهد', async () => {
  relayEnv();
  delete process.env.MAIL_RELAY_TOKEN;
  mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }));
  const { sendOtpEmail } = require('../utils/mailer');
  await assert.rejects(() => sendOtpEmail('a@x.ir', '123456'), /MAIL_RELAY_TOKEN/);
});
