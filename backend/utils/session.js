// کوکی نشست (JWT داخل کوکی httpOnly). جاوااسکریپت مرورگر نمی‌تواند آن را بخواند،
// پس حتی اگر روزی XSS پیدا شود، توکن کاربر دزدیده نمی‌شود.
const COOKIE_NAME = 'anketnevis_session';
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // هم‌اندازه‌ی انقضای JWT

function parseCookies(header) {
  const out = Object.create(null);
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    if (!key || key in out) continue;
    let value = part.slice(i + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try { out[key] = decodeURIComponent(value); } catch (_) { out[key] = value; }
  }
  return out;
}

function sameSite() {
  const v = String(process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
  return ['lax', 'strict', 'none'].includes(v) ? v : 'lax';
}

function useSecure() {
  return process.env.NODE_ENV === 'production' || sameSite() === 'none';
}

function cookieAttributes(maxAge) {
  const ss = sameSite();
  const parts = [`Path=/`, `HttpOnly`, `SameSite=${ss[0].toUpperCase()}${ss.slice(1)}`, `Max-Age=${maxAge}`];
  if (maxAge === 0) parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  if (useSecure()) parts.push('Secure');
  return parts.join('; ');
}

function setSessionCookie(res, token) {
  res.append('Set-Cookie', `${COOKIE_NAME}=${token}; ${cookieAttributes(MAX_AGE_SECONDS)}`);
}

function clearSessionCookie(res) {
  res.append('Set-Cookie', `${COOKIE_NAME}=; ${cookieAttributes(0)}`);
}

function getSessionToken(req) {
  return parseCookies(req.headers.cookie)[COOKIE_NAME] || null;
}

module.exports = { COOKIE_NAME, parseCookies, setSessionCookie, clearSessionCookie, getSessionToken };
