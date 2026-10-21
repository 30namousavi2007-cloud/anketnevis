// ذخیره‌ی فایل‌های PDF و صوتی
//  - local: پوشه‌ی UPLOAD_DIR روی دیسک سرور (فقط وقتی دیسک دائمی دارید مناسب است)
//  - supabase: Supabase Storage. روی Render رایگان دیسک دائمی نیست و فایل‌ها با هر deploy پاک می‌شوند،
//    پس با تنظیم SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY فایل‌ها در یک bucket خصوصی ذخیره می‌شوند.
// فایل‌ها همیشه از طریق همین بک‌اند و با لینک امضاشده پخش می‌شوند (bucket خصوصی است).
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { UPLOAD_DIR } = require('../middleware/upload');
const streamFile = require('./streamFile');

const MIME = { '.pdf': 'application/pdf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4' };

function contentTypeFor(filename, fallback = 'application/octet-stream') {
  return MIME[path.extname(String(filename || '')).toLowerCase()] || fallback;
}

function config() {
  return {
    url: String(process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    bucket: process.env.SUPABASE_BUCKET || 'books',
  };
}

function useSupabase() {
  const c = config();
  return Boolean(c.url && c.key);
}

function authHeaders(extra = {}) {
  const { key } = config();
  return { apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

function objectUrl(filename, prefix = '') {
  const c = config();
  return `${c.url}/storage/v1/object/${prefix}${encodeURIComponent(c.bucket)}/${encodeURIComponent(path.basename(filename))}`;
}

async function errorText(res) {
  try { return (await res.text()).slice(0, 200); } catch (_) { return ''; }
}

// فایل تأییدشده‌ی موقت (داخل UPLOAD_DIR) را با نام نهایی در ذخیره‌گاه دائمی می‌گذارد
async function persist(tempFilename, storedName) {
  const tempPath = path.join(UPLOAD_DIR, tempFilename);
  if (!useSupabase()) {
    if (tempFilename !== storedName) fs.renameSync(tempPath, path.join(UPLOAD_DIR, storedName));
    return;
  }
  const body = await fs.promises.readFile(tempPath);
  const res = await fetch(objectUrl(storedName), {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': contentTypeFor(storedName), 'x-upsert': 'true' }),
    body,
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`آپلود در Supabase Storage ناموفق بود (${res.status}): ${await errorText(res)}`);
  await fs.promises.unlink(tempPath).catch(() => {});
}

// حذف فایل؛ خطا فقط در لاگ ثبت می‌شود
async function remove(filename) {
  if (!filename) return;
  try {
    if (!useSupabase()) {
      await fs.promises.unlink(path.join(UPLOAD_DIR, path.basename(filename))).catch((err) => {
        if (err.code !== 'ENOENT') console.error('خطا در حذف فایل:', err);
      });
      return;
    }
    const res = await fetch(objectUrl(filename), { method: 'DELETE', headers: authHeaders(), signal: AbortSignal.timeout(20000) });
    if (!res.ok && res.status !== 404) console.error(`خطا در حذف فایل از Supabase (${res.status}): ${await errorText(res)}`);
  } catch (err) {
    console.error('خطا در حذف فایل:', err.message);
  }
}

// پخش فایل با پشتیبانی از Range (برای جلو/عقب بردن صوت و PDF)
async function stream(req, res, filename, { contentType, disposition }) {
  if (!useSupabase()) {
    return streamFile(req, res, path.join(UPLOAD_DIR, path.basename(filename)), { contentType, disposition });
  }
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  let upstream;
  try {
    upstream = await fetch(objectUrl(filename, 'authenticated/'), {
      headers: authHeaders(req.headers.range ? { Range: req.headers.range } : {}),
      signal: controller.signal,
    });
  } catch (err) {
    if (!res.headersSent && !controller.signal.aborted) {
      console.error('خطا در دریافت فایل از Supabase:', err.message);
      res.status(502).json({ error: 'دریافت فایل از ذخیره‌گاه ناموفق بود.' });
    }
    return;
  }

  if (upstream.status === 404 || upstream.status === 400) {
    return res.status(404).json({ error: 'فایل پیدا نشد.' });
  }
  if (upstream.status === 416) {
    const range = upstream.headers.get('content-range');
    if (range) res.setHeader('Content-Range', range);
    return res.status(416).end();
  }
  if (!upstream.ok) {
    console.error(`Supabase Storage پاسخ ${upstream.status} داد: ${await errorText(upstream)}`);
    return res.status(502).json({ error: 'دریافت فایل از ذخیره‌گاه ناموفق بود.' });
  }

  res.status(upstream.status);
  res.setHeader('Content-Type', contentType);
  if (disposition) res.setHeader('Content-Disposition', disposition);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, no-store');
  const contentRange = upstream.headers.get('content-range');
  if (contentRange) res.setHeader('Content-Range', contentRange);
  // اگر پاسخ بالادستی فشرده باشد طول آن با طول داده‌ی بازشده یکی نیست
  const length = upstream.headers.get('content-length');
  if (length && !upstream.headers.get('content-encoding')) res.setHeader('Content-Length', length);

  if (!upstream.body) return res.end();
  Readable.fromWeb(upstream.body)
    .on('error', () => res.destroy())
    .pipe(res);
}

module.exports = { persist, remove, stream, contentTypeFor, useSupabase };
