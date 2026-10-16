// هدرهای امنیتی، محافظ CSRF و محدودکننده‌ی تعداد درخواست (بدون وابستگی خارجی)

function allowedOrigins() {
  return String(process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function securityHeaders(req, res, next) {
  res.removeHeader('X-Powered-By');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  // فقط خود سایت اجازه دارد صفحه‌های این بک‌اند (مثلاً PDF) را در iframe نشان دهد
  res.setHeader('Content-Security-Policy', `frame-ancestors ${allowedOrigins().join(' ')}`);
  // فایل‌ها با لینک امضاشده از سایت دیگری (فرانت) لود می‌شوند
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
}

// چون نشست در کوکی است، درخواست‌های تغییردهنده (POST/PUT/DELETE) باید هم از سایت خودمان بیایند
// (هدر Origin) و هم هدر سفارشی داشته باشند؛ فرم یا سایت مهاجم نمی‌تواند هدر سفارشی بفرستد.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_HEADER_VALUE = 'anketnevis';

function csrfGuard(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && !allowedOrigins().includes(origin)) {
    return res.status(403).json({ error: 'درخواست از مبدأ نامعتبر ارسال شده است.' });
  }
  if (req.headers['x-requested-with'] !== CSRF_HEADER_VALUE) {
    return res.status(403).json({ error: 'درخواست نامعتبر است.' });
  }
  next();
}

// محدودکننده‌ی ساده‌ی درون‌حافظه. اگر بک‌اند را روی چند سرور اجرا کنید، هر سرور شمارنده‌ی جدا دارد.
function rateLimit({ windowMs, max, keyFn, message }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, Math.min(windowMs, 60 * 1000));
  timer.unref();

  const middleware = (req, res, next) => {
    const key = keyFn ? keyFn(req) : req.ip;
    const now = Date.now();
    if (hits.size > 100000) hits.clear(); // سقف حافظه
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({ error: message || 'درخواست‌های شما زیاد بود. کمی بعد دوباره تلاش کنید.' });
    }
    next();
  };
  middleware.reset = () => hits.clear();
  return middleware;
}

const emailKey = (prefix) => (req) => `${prefix}:${String(req.body?.email || '').trim().toLowerCase().slice(0, 200)}`;

module.exports = { allowedOrigins, securityHeaders, csrfGuard, rateLimit, emailKey };
