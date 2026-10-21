process.env.JWT_SECRET = 'x'.repeat(40);
process.env.DATABASE_URL = 'postgres://u:p@localhost/db';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const express = require('express');

const { parseCookies, setSessionCookie, clearSessionCookie } = require('../utils/session');
const { rateLimit, csrfGuard } = require('../utils/security');
const { createSignedPath, verifySigned } = require('../utils/signedUrl');
const { detect, isRealPdf, audioKind } = require('../utils/fileSignature');
const streamFile = require('../utils/streamFile');
const compressJson = require('../utils/compressJson');
const { stripSslMode } = require('../db/pool');

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

test('parseCookies می‌خواند و قطعه‌های خراب را نادیده می‌گیرد', () => {
  const c = parseCookies('a=1; anketnevis_session=abc.def; bad; b=%D8%A7');
  assert.strictEqual(c.a, '1');
  assert.strictEqual(c.anketnevis_session, 'abc.def');
  assert.strictEqual(c.b, 'ا');
  assert.strictEqual(c.__proto__, undefined);
});

test('کوکی نشست httpOnly و SameSite دارد و در production امن (Secure) است', () => {
  const headers = [];
  const res = { append: (k, v) => headers.push(v) };
  setSessionCookie(res, 'tok');
  assert.match(headers[0], /HttpOnly/);
  assert.match(headers[0], /SameSite=Lax/);
  assert.doesNotMatch(headers[0], /Secure/);
  process.env.NODE_ENV = 'production';
  setSessionCookie(res, 'tok');
  assert.match(headers[1], /Secure/);
  clearSessionCookie(res);
  assert.match(headers[2], /Max-Age=0/);
  process.env.NODE_ENV = 'test';
});

test('rateLimit بعد از سقف ۴۲۹ می‌دهد و Retry-After می‌گذارد', () => {
  const limiter = rateLimit({ windowMs: 60000, max: 3 });
  const make = () => {
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; } };
    let passed = false;
    limiter({ ip: '1.2.3.4' }, res, () => { passed = true; });
    return { res, passed };
  };
  assert.ok(make().passed && make().passed && make().passed);
  const blocked = make();
  assert.strictEqual(blocked.passed, false);
  assert.strictEqual(blocked.res.statusCode, 429);
  assert.ok(Number(blocked.res.headers['Retry-After']) > 0);
  // آی‌پی دیگر مسدود نیست
  const other = { statusCode: 200, setHeader() {}, status() { return this; }, json() {} };
  let ok = false;
  limiter({ ip: '9.9.9.9' }, other, () => { ok = true; });
  assert.ok(ok);
});

test('csrfGuard: بدون هدر سفارشی یا با Origin بیگانه رد می‌شود', () => {
  const run = (req) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json() {} };
    let passed = false;
    csrfGuard(req, res, () => { passed = true; });
    return { passed, status: res.statusCode };
  };
  assert.ok(run({ method: 'GET', headers: {} }).passed);
  assert.strictEqual(run({ method: 'POST', headers: {} }).status, 403);
  assert.strictEqual(run({ method: 'POST', headers: { 'x-requested-with': 'anketnevis', origin: 'https://evil.com' } }).status, 403);
  assert.ok(run({ method: 'POST', headers: { 'x-requested-with': 'anketnevis', origin: 'http://localhost:5173' } }).passed);
  assert.ok(run({ method: 'DELETE', headers: { 'x-requested-with': 'anketnevis' } }).passed);
});

test('لینک امضاشده: درست، دستکاری‌شده و منقضی', () => {
  const url = new URL('http://x' + createSignedPath(7, 'pdf'));
  const exp = url.searchParams.get('exp');
  const sig = url.searchParams.get('sig');
  assert.ok(verifySigned('7', 'pdf', exp, sig));
  assert.ok(!verifySigned('8', 'pdf', exp, sig), 'اثر دیگر');
  assert.ok(!verifySigned('7', 'audio', exp, sig), 'نوع دیگر');
  assert.ok(!verifySigned('7', 'pdf', Number(exp) + 1000, sig), 'تمدید انقضا');
  assert.ok(!verifySigned('7', 'pdf', exp, sig.slice(0, -2) + 'AA'));
  const expired = new URL('http://x' + createSignedPath(7, 'pdf', -10));
  assert.ok(!verifySigned('7', 'pdf', expired.searchParams.get('exp'), expired.searchParams.get('sig')));
  assert.ok(!verifySigned('7', 'pdf', undefined, undefined));
});

test('تشخیص نوع واقعی فایل از روی محتوا', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sig-'));
  const w = (name, buf) => { const p = path.join(dir, name); fs.writeFileSync(p, buf); return p; };
  assert.ok(isRealPdf(w('a.pdf', Buffer.from('%PDF-1.7\n...'))));
  assert.ok(!isRealPdf(w('fake.pdf', Buffer.from('MZ\x90\x00 exe'))));
  assert.ok(!isRealPdf(w('html.pdf', Buffer.from('<html><script>alert(1)</script>'))));
  assert.strictEqual(audioKind(w('a.mp3', Buffer.concat([Buffer.from('ID3'), Buffer.alloc(20)]))), 'mp3');
  assert.strictEqual(audioKind(w('b.mp3', Buffer.from([0xff, 0xfb, 0x90, 0x00, 0, 0, 0, 0]))), 'mp3');
  assert.strictEqual(audioKind(w('a.wav', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt ')]))), 'wav');
  assert.strictEqual(audioKind(w('a.ogg', Buffer.from('OggS\x00\x02'))), 'ogg');
  assert.strictEqual(audioKind(w('a.m4a', Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A ')]))), 'm4a');
  assert.strictEqual(audioKind(w('x.mp3', Buffer.from('#!/bin/sh\nrm -rf /'))), null);
  assert.strictEqual(detect(Buffer.alloc(0)), null);
  fs.rmSync(dir, { recursive: true });
});

test('streamFile: کامل، Range، آخرین N بایت و ۴۱۶', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'str-'));
  const file = path.join(dir, 'f.bin');
  fs.writeFileSync(file, Buffer.from('0123456789'));
  const app = express();
  app.get('/f', (req, res) => streamFile(req, res, file, { contentType: 'application/octet-stream' }));
  app.get('/missing', (req, res) => streamFile(req, res, path.join(dir, 'nope'), { contentType: 'x/y' }));
  const { server, base } = await listen(app);
  try {
    let r = await fetch(`${base}/f`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(await r.text(), '0123456789');
    assert.strictEqual(r.headers.get('accept-ranges'), 'bytes');

    r = await fetch(`${base}/f`, { headers: { Range: 'bytes=2-4' } });
    assert.strictEqual(r.status, 206);
    assert.strictEqual(await r.text(), '234');
    assert.strictEqual(r.headers.get('content-range'), 'bytes 2-4/10');

    r = await fetch(`${base}/f`, { headers: { Range: 'bytes=-3' } });
    assert.strictEqual(await r.text(), '789');

    r = await fetch(`${base}/f`, { headers: { Range: 'bytes=5-' } });
    assert.strictEqual(await r.text(), '56789');

    r = await fetch(`${base}/f`, { headers: { Range: 'bytes=50-60' } });
    assert.strictEqual(r.status, 416);
    r = await fetch(`${base}/f`, { headers: { Range: 'bytes=abc-' } });
    assert.strictEqual(r.status, 200, 'Range خراب نادیده گرفته می‌شود');
    r = await fetch(`${base}/missing`);
    assert.strictEqual(r.status, 404);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true });
  }
});

test('compressJson: پاسخ بزرگ gzip می‌شود و کوچک نه', async () => {
  const app = express();
  app.use(compressJson);
  app.get('/big', (req, res) => res.json({ text: 'سلام '.repeat(1000) }));
  app.get('/small', (req, res) => res.json({ ok: true }));
  const { server, base } = await listen(app);
  try {
    const big = await new Promise((resolve, reject) => {
      http.get(`${base}/big`, { headers: { 'Accept-Encoding': 'gzip' } }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ res, body: Buffer.concat(chunks) }));
      }).on('error', reject);
    });
    assert.strictEqual(big.res.headers['content-encoding'], 'gzip');
    assert.strictEqual(JSON.parse(zlib.gunzipSync(big.body).toString()).text.length, 'سلام '.length * 1000);
    const small = await fetch(`${base}/small`, { headers: { 'Accept-Encoding': 'gzip' } });
    assert.strictEqual(small.headers.get('content-encoding'), null);
    assert.deepStrictEqual(await small.json(), { ok: true });
  } finally {
    server.close();
  }
});

test('stripSslMode پارامتر sslmode را بدون آسیب به بقیه برمی‌دارد', () => {
  assert.strictEqual(stripSslMode('postgres://u:p@h/db?sslmode=require'), 'postgres://u:p@h/db');
  assert.strictEqual(stripSslMode('postgres://u:p@h/db?sslmode=require&x=1'), 'postgres://u:p@h/db?x=1');
  assert.strictEqual(stripSslMode('postgres://u:p@h/db?x=1&sslmode=require'), 'postgres://u:p@h/db?x=1');
  assert.strictEqual(stripSslMode('postgres://u:p@h/db'), 'postgres://u:p@h/db');
});

test('registrableDomain: دامنه‌های onrender.com و vercel.app سایت‌های جدا حساب می‌شوند', () => {
  const { registrableDomain } = require('../utils/checkEnv');
  assert.notStrictEqual(registrableDomain('https://anketnevis-1.onrender.com'), registrableDomain('https://anketnevis.onrender.com'));
  assert.strictEqual(registrableDomain('https://anketnevis.onrender.com'), 'anketnevis.onrender.com');
  assert.notStrictEqual(registrableDomain('https://a.vercel.app'), registrableDomain('https://b.onrender.com'));
  assert.strictEqual(registrableDomain('https://app.example.ir'), registrableDomain('https://api.example.ir'));
  assert.strictEqual(registrableDomain('https://app.example.co.ir'), 'example.co.ir');
  assert.strictEqual(registrableDomain('http://localhost:5173'), registrableDomain('http://localhost:4000'));
});
