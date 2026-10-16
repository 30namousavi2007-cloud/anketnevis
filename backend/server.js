require('dotenv').config();
require('./utils/checkEnv')();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const itemsRoutes = require('./routes/items');
const adminRoutes = require('./routes/admin');
const authorsRoutes = require('./routes/authors');
const paymentsRoutes = require('./routes/payments');
const ordersRoutes = require('./routes/orders');
const { allowedOrigins, securityHeaders, csrfGuard, rateLimit, emailKey } = require('./utils/security');
const compressJson = require('./utils/compressJson');

const app = express();
const PORT = process.env.PORT || 4000;

app.disable('x-powered-by');

// پشت پروکسی (Railway، Render، Nginx و ...) آی‌پی واقعی کاربر از هدر X-Forwarded-For می‌آید.
// بدون این تنظیم، محدودکننده‌ی درخواست همه‌ی کاربران را یک نفر می‌بیند. تعداد پروکسی‌ها: TRUST_PROXY (پیش‌فرض ۱ در production)
const trustProxy = process.env.TRUST_PROXY ?? (process.env.NODE_ENV === 'production' ? '1' : '');
if (trustProxy !== '') app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === 'true');

app.use(securityHeaders);
app.use(compressJson);
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || allowedOrigins().includes(origin)),
    credentials: true, // کوکی نشست
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Requested-With'],
    maxAge: 600,
  })
);
app.use(express.json({ limit: '100kb' }));
app.use(csrfGuard);

// ---------------------------------------------------------------------------
// محدودیت تعداد درخواست
// ---------------------------------------------------------------------------
const MIN = 60 * 1000;
const tooMany = 'تعداد درخواست‌های شما زیاد بود. چند دقیقه بعد دوباره تلاش کنید.';

app.use('/api', rateLimit({ windowMs: MIN, max: 300 }));

app.use('/api/auth/login', rateLimit({ windowMs: 15 * MIN, max: 10, message: tooMany }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * MIN, max: 10, keyFn: emailKey('login'), message: tooMany }));
app.use('/api/auth/verify-otp', rateLimit({ windowMs: 15 * MIN, max: 15, message: tooMany }));
app.use('/api/auth/verify-otp', rateLimit({ windowMs: 15 * MIN, max: 10, keyFn: emailKey('otp'), message: tooMany }));
app.use('/api/auth/resend-otp', rateLimit({ windowMs: 15 * MIN, max: 5, message: tooMany }));
app.use('/api/auth/resend-otp', rateLimit({ windowMs: 15 * MIN, max: 5, keyFn: emailKey('resend'), message: tooMany }));
app.use('/api/auth/register', rateLimit({ windowMs: 60 * MIN, max: 10, message: tooMany }));
app.use('/api/auth/admin-setup', rateLimit({ windowMs: 60 * MIN, max: 5, message: tooMany }));

app.use('/api/payments/checkout', rateLimit({ windowMs: 10 * MIN, max: 20, message: tooMany }));
app.post('/api/items/:id/comments', rateLimit({ windowMs: 10 * MIN, max: 30, message: tooMany }));
app.post('/api/items/:id/rating', rateLimit({ windowMs: 10 * MIN, max: 60, message: tooMany }));
app.post('/api/items/:id/files', rateLimit({ windowMs: 60 * MIN, max: 30, message: tooMany }));

// بررسی سلامت سرور
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/items', itemsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/authors', authorsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/orders', ordersRoutes);

// هندلر خطای ۴۰۴ برای مسیرهای ناشناخته
app.use((req, res) => {
  res.status(404).json({ error: 'مسیر مورد نظر پیدا نشد.' });
});

// هندلر خطای عمومی: جزئیات خطا هیچ‌وقت به کاربر نشان داده نمی‌شود
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'بدنه‌ی درخواست نامعتبر است.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'حجم درخواست بیش از حد مجاز است.' });
  console.error('خطای پیش‌بینی‌نشده:', err);
  res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
});

process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 سرور آنکت‌نویس روی پورت ${PORT} اجرا شد`);
    console.log(`   http://localhost:${PORT}/api/health`);
  });
}

module.exports = app;
