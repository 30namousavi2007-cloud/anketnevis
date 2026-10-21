const fs = require('fs');
const os = require('os');
const path = require('path');
const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'stor-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const storage = require('../utils/storage');

const realFetch = global.fetch;
const realFetchRef = () => realFetch;
test.afterEach(() => {
  global.fetch = realFetch;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_BUCKET;
});

function useSupabaseEnv() {
  process.env.SUPABASE_URL = 'https://proj.supabase.co/';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  process.env.SUPABASE_BUCKET = 'books';
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

test('بدون تنظیمات Supabase: حالت local (انتقال فایل در همان پوشه)', async () => {
  assert.strictEqual(storage.useSupabase(), false);
  fs.writeFileSync(path.join(UPLOAD_DIR, 'tmpname.mp3'), 'ID3data');
  await storage.persist('tmpname.mp3', 'final.mp3');
  assert.ok(fs.existsSync(path.join(UPLOAD_DIR, 'final.mp3')));
  assert.ok(!fs.existsSync(path.join(UPLOAD_DIR, 'tmpname.mp3')));
  await storage.remove('final.mp3');
  assert.ok(!fs.existsSync(path.join(UPLOAD_DIR, 'final.mp3')));
  await storage.remove('does-not-exist.pdf'); // خطا نمی‌دهد
});

test('Supabase: آپلود با آدرس و هدر درست و پاک شدن فایل موقت', async () => {
  useSupabaseEnv();
  assert.strictEqual(storage.useSupabase(), true);
  fs.writeFileSync(path.join(UPLOAD_DIR, 'temp1.pdf'), '%PDF-1.4 hello');
  const calls = [];
  global.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 200 }; };
  await storage.persist('temp1.pdf', 'abc123.pdf');
  assert.strictEqual(calls[0].url, 'https://proj.supabase.co/storage/v1/object/books/abc123.pdf');
  assert.strictEqual(calls[0].opts.method, 'POST');
  assert.strictEqual(calls[0].opts.headers.Authorization, 'Bearer service-key');
  assert.strictEqual(calls[0].opts.headers.apikey, 'service-key');
  assert.strictEqual(calls[0].opts.headers['Content-Type'], 'application/pdf');
  assert.strictEqual(Buffer.from(calls[0].opts.body).toString(), '%PDF-1.4 hello');
  assert.ok(!fs.existsSync(path.join(UPLOAD_DIR, 'temp1.pdf')), 'فایل موقت باید پاک شود');
});

test('Supabase: شکست آپلود خطا می‌دهد و فایل موقت برای پاکسازی سمت مسیر می‌ماند', async () => {
  useSupabaseEnv();
  fs.writeFileSync(path.join(UPLOAD_DIR, 'temp2.pdf'), '%PDF-1.4');
  global.fetch = async () => ({ ok: false, status: 403, text: async () => 'Unauthorized' });
  await assert.rejects(() => storage.persist('temp2.pdf', 'x.pdf'), /403/);
  assert.ok(fs.existsSync(path.join(UPLOAD_DIR, 'temp2.pdf')));
});

test('Supabase: حذف فایل (و بی‌خطر بودن خطای ۴۰۴)', async () => {
  useSupabaseEnv();
  const calls = [];
  global.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: false, status: 404, text: async () => '' }; };
  await storage.remove('old file.pdf');
  assert.strictEqual(calls[0].opts.method, 'DELETE');
  assert.strictEqual(calls[0].url, 'https://proj.supabase.co/storage/v1/object/books/old%20file.pdf');
  global.fetch = async () => { throw new Error('network down'); };
  await storage.remove('x.pdf'); // نباید پرتاب شود
});

test('Supabase: پخش فایل با عبور Range و کد ۲۰۶', async () => {
  useSupabaseEnv();
  const seen = [];
  global.fetch = async (url, opts) => {
    seen.push({ url, headers: opts.headers });
    const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('234')); c.close(); } });
    return { ok: true, status: 206, body, headers: new Headers({ 'content-range': 'bytes 2-4/10', 'content-length': '3' }) };
  };
  const app = express();
  app.get('/f', (req, res) => storage.stream(req, res, 'song.mp3', { contentType: 'audio/mpeg' }));
  const { server, base } = await listen(app);
  try {
    const localFetch = realFetchRef();
    global.fetch = (u, o) => (String(u).startsWith(base) ? localFetch(u, o) : seen.length >= 0 && mockUpstream(u, o));
    function mockUpstream(url, opts) {
      seen.push({ url, headers: opts.headers });
      const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('234')); c.close(); } });
      return Promise.resolve({ ok: true, status: 206, body, headers: new Headers({ 'content-range': 'bytes 2-4/10', 'content-length': '3' }) });
    }
    const r = await global.fetch(`${base}/f`, { headers: { Range: 'bytes=2-4' } });
    assert.strictEqual(r.status, 206);
    assert.strictEqual(r.headers.get('content-range'), 'bytes 2-4/10');
    assert.strictEqual(r.headers.get('content-type'), 'audio/mpeg');
    assert.strictEqual(await r.text(), '234');
    const upstreamCall = seen.find((s) => s.url.includes('/storage/v1/object/authenticated/books/song.mp3'));
    assert.ok(upstreamCall, 'باید از مسیر authenticated دریافت شود');
    assert.strictEqual(upstreamCall.headers.Range, 'bytes=2-4');
    assert.strictEqual(upstreamCall.headers.Authorization, 'Bearer service-key');
  } finally {
    server.close();
  }
});

test('Supabase: فایل نبود ۴۰۴ می‌شود، خطای ذخیره‌گاه ۵۰۲، Range نامعتبر ۴۱۶', async () => {
  useSupabaseEnv();
  let mode = 'missing';
  const app = express();
  app.get('/f', (req, res) => storage.stream(req, res, 'x.pdf', { contentType: 'application/pdf' }));
  const { server, base } = await listen(app);
  try {
    const localFetch = realFetchRef();
    global.fetch = (u, o) => {
      if (String(u).startsWith(base)) return localFetch(u, o);
      if (mode === 'missing') return Promise.resolve({ ok: false, status: 400, text: async () => 'not_found' });
      if (mode === 'error') return Promise.resolve({ ok: false, status: 500, text: async () => 'boom' });
      return Promise.resolve({ ok: false, status: 416, headers: new Headers({ 'content-range': 'bytes */10' }), text: async () => '' });
    };
    assert.strictEqual((await global.fetch(`${base}/f`)).status, 404);
    mode = 'error';
    assert.strictEqual((await global.fetch(`${base}/f`)).status, 502);
    mode = 'range';
    const r = await global.fetch(`${base}/f`, { headers: { Range: 'bytes=99-100' } });
    assert.strictEqual(r.status, 416);
    assert.strictEqual(r.headers.get('content-range'), 'bytes */10');
  } finally {
    server.close();
  }
});

test('contentTypeFor نوع فایل را از پسوند می‌شناسد', () => {
  assert.strictEqual(storage.contentTypeFor('a.PDF'), 'application/pdf');
  assert.strictEqual(storage.contentTypeFor('a.m4a'), 'audio/mp4');
  assert.strictEqual(storage.contentTypeFor('a.xyz', 'audio/mpeg'), 'audio/mpeg');
});
