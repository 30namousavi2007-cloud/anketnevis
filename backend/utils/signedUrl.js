// لینک امضاشده و کوتاه‌عمر برای پخش فایل‌ها.
// به‌جای گذاشتن توکن ورود در آدرس، سرور بعد از بررسی دسترسی یک لینک مخصوص همان فایل می‌سازد.
const crypto = require('crypto');

const DEFAULT_TTL_SECONDS = 2 * 60 * 60; // برای شنیدن یک فایل صوتی طولانی کافی است

function key() {
  return crypto.createHmac('sha256', process.env.JWT_SECRET || '').update('file-url-v1').digest();
}

function signature(itemId, kind, exp) {
  return crypto.createHmac('sha256', key()).update(`${itemId}:${kind}:${exp}`).digest('base64url');
}

function createSignedPath(itemId, kind, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `/api/items/${itemId}/stream/${kind}?exp=${exp}&sig=${signature(itemId, kind, exp)}`;
}

function verifySigned(itemId, kind, exp, sig) {
  const expNum = Number(exp);
  if (!Number.isInteger(expNum) || expNum < Math.floor(Date.now() / 1000)) return false;
  if (typeof sig !== 'string') return false;
  const expected = Buffer.from(signature(itemId, kind, expNum));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

module.exports = { createSignedPath, verifySigned };
