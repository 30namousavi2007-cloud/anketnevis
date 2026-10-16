const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/authMiddleware');
const { setSessionCookie, clearSessionCookie } = require('../utils/session');
const { sendOtpEmail } = require('../utils/mailer');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;          // بعد از ۵ حدس اشتباه، کد باطل می‌شود
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

// کد تأیید هیچ‌وقت به‌صورت متن ساده در دیتابیس نمی‌ماند
function hashOtp(code) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET || '').update(`otp:${code}`).digest('hex');
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function passwordError(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) return `رمز عبور باید حداقل ${PASSWORD_MIN} کاراکتر باشد.`;
  if (password.length > PASSWORD_MAX) return 'رمز عبور خیلی طولانی است.';
  return null;
}

function signToken(user) {
  return jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '7d' }
  );
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function generateOtpCode() {
  // عدد شش‌رقمی تصادفی و امن، هیچ‌وقت با صفر شروع نمی‌شود که کوتاه‌تر نشان داده نشود
  return crypto.randomInt(100000, 999999).toString();
}

// POST /api/auth/register
// حساب با نقش «خواننده» ساخته می‌شود ولی تا وقتی ایمیل با کد شش‌رقمی تأیید نشود نشستی داده نمی‌شود.
// (مرحله‌ی دوم همان /verify-otp است.)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
      return res.status(400).json({ error: 'نام و نام خانوادگی را وارد کنید.' });
    }
    if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 200) {
      return res.status(400).json({ error: 'ایمیل معتبر نیست.' });
    }
    const pwError = passwordError(password);
    if (pwError) return res.status(400).json({ error: pwError });

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await pool.query('SELECT id, email_verified, otp_expires_at FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
    const found = existing.rows[0];

    if (found && found.email_verified) {
      return res.status(409).json({ error: 'حسابی با این ایمیل قبلاً ثبت شده است.' });
    }

    // حساب تأییدنشده‌ی قبلی (مثلاً کد نرسید یا ایمیل اشتباه تایپ شد): اگر هنوز کد تازه‌ای فرستاده شده،
    // چیزی عوض نمی‌شود و همان کد معتبر است؛ بعد از ۶۰ ثانیه ثبت‌نام دوباره روی همان حساب انجام می‌شود.
    if (found) {
      const issuedAt = found.otp_expires_at ? new Date(found.otp_expires_at).getTime() - OTP_TTL_MINUTES * 60 * 1000 : 0;
      if (Date.now() - issuedAt < OTP_RESEND_COOLDOWN_MS) {
        return res.status(201).json({ requiresOtp: true, email: normalizedEmail });
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    if (found) {
      await pool.query(
        'UPDATE users SET name = $1, password_hash = $2, otp_code = $3, otp_expires_at = $4, otp_attempts = 0 WHERE id = $5',
        [name.trim(), passwordHash, hashOtp(code), expiresAt, found.id]
      );
    } else {
      try {
        await pool.query(
          `INSERT INTO users (name, email, password_hash, email_verified, otp_code, otp_expires_at, otp_attempts)
           VALUES ($1, $2, $3, false, $4, $5, 0)
           RETURNING id, name, email, role`,
          [name.trim(), normalizedEmail, passwordHash, hashOtp(code), expiresAt]
        );
      } catch (insertErr) {
        if (insertErr.code === '23505') {
          return res.status(409).json({ error: 'حسابی با این ایمیل قبلاً ثبت شده است.' });
        }
        throw insertErr;
      }
    }

    try {
      await sendOtpEmail(normalizedEmail, code, 'register');
    } catch (mailErr) {
      console.error('خطا در ارسال ایمیل تأیید ثبت‌نام:', mailErr);
      return res.status(500).json({ error: 'ارسال ایمیل تأیید ناموفق بود. چند دقیقه بعد دوباره ثبت‌نام کنید.' });
    }

    res.status(201).json({ requiresOtp: true, email: normalizedEmail });
  } catch (err) {
    console.error('خطا در ثبت‌نام:', err);
    res.status(500).json({ error: 'مشکلی در سرور پیش آمد. دوباره تلاش کنید.' });
  }
});

// POST /api/auth/login  (مرحله‌ی اول: بررسی ایمیل/رمز، سپس ارسال کد تأیید به ایمیل)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return res.status(400).json({ error: 'ایمیل و رمز عبور را وارد کنید.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'ایمیل یا رمز عبور اشتباه است.' });
    }
    if (user.is_blocked) {
      return res.status(403).json({ error: 'حساب کاربری شما مسدود شده است.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'ایمیل یا رمز عبور اشتباه است.' });
    }

    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await pool.query(
      'UPDATE users SET otp_code = $1, otp_expires_at = $2, otp_attempts = 0 WHERE id = $3',
      [hashOtp(code), expiresAt, user.id]
    );

    try {
      await sendOtpEmail(user.email, code);
    } catch (mailErr) {
      console.error('خطا در ارسال ایمیل کد تأیید:', mailErr);
      return res.status(500).json({ error: 'ارسال ایمیل کد تأیید ناموفق بود. تنظیمات ایمیل سرور را بررسی کنید.' });
    }

    res.json({ requiresOtp: true, email: user.email });
  } catch (err) {
    console.error('خطا در ورود:', err);
    res.status(500).json({ error: 'مشکلی در سرور پیش آمد. دوباره تلاش کنید.' });
  }
});

// POST /api/auth/verify-otp  (مرحله‌ی دوم: بررسی کد ارسال‌شده به ایمیل)
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (typeof email !== 'string' || !email || !code) {
      return res.status(400).json({ error: 'ایمیل و کد تأیید را وارد کنید.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
    const user = result.rows[0];

    if (!user || !user.otp_code || !user.otp_expires_at) {
      return res.status(400).json({ error: 'ابتدا باید درخواست کد تأیید بدهید.' });
    }
    if (user.is_blocked) {
      return res.status(403).json({ error: 'حساب کاربری شما مسدود شده است.' });
    }
    if (new Date(user.otp_expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'کد تأیید منقضی شده است. دوباره تلاش کنید.' });
    }

    // شمارش تلاش قبل از مقایسه و به‌صورت اتمیک؛ حتی با درخواست‌های هم‌زمان بیش از ۵ حدس ممکن نیست
    const attempt = await pool.query(
      'UPDATE users SET otp_attempts = otp_attempts + 1 WHERE id = $1 RETURNING otp_attempts',
      [user.id]
    );
    if (attempt.rows[0].otp_attempts > OTP_MAX_ATTEMPTS) {
      await pool.query('UPDATE users SET otp_code = NULL, otp_expires_at = NULL WHERE id = $1', [user.id]);
      return res.status(429).json({ error: 'تعداد تلاش‌های اشتباه زیاد بود. دوباره با ایمیل و رمز وارد شوید.' });
    }

    if (!safeEqual(user.otp_code, hashOtp(String(code).trim()))) {
      return res.status(400).json({ error: 'کد تأیید اشتباه است.' });
    }

    await pool.query(
      'UPDATE users SET otp_code = NULL, otp_expires_at = NULL, otp_attempts = 0, email_verified = true WHERE id = $1',
      [user.id]
    );

    setSessionCookie(res, signToken(user));
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('خطا در بررسی کد تأیید:', err);
    res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
  }
});

// POST /api/auth/resend-otp  (ارسال دوباره‌ی کد، مثلاً اگر کد قبلی نرسید)
// پاسخ همیشه یکسان است تا کسی نتواند با آن بفهمد چه ایمیل‌هایی در سایت ثبت‌نام کرده‌اند.
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (typeof email !== 'string' || !email) return res.status(400).json({ error: 'ایمیل را وارد کنید.' });

    const normalizedEmail = email.trim().toLowerCase();
    const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
    const user = result.rows[0];

    if (user && !user.is_blocked) {
      const issuedAt = user.otp_expires_at ? new Date(user.otp_expires_at).getTime() - OTP_TTL_MINUTES * 60 * 1000 : 0;
      const tooSoon = Date.now() - issuedAt < OTP_RESEND_COOLDOWN_MS;
      if (!tooSoon) {
        const code = generateOtpCode();
        const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
        await pool.query(
          'UPDATE users SET otp_code = $1, otp_expires_at = $2, otp_attempts = 0 WHERE id = $3',
          [hashOtp(code), expiresAt, user.id]
        );
        await sendOtpEmail(user.email, code, user.email_verified === false ? 'register' : 'login');
      }
    }
    res.json({ sent: true });
  } catch (err) {
    console.error('خطا در ارسال دوباره‌ی کد:', err);
    res.status(500).json({ error: 'ارسال دوباره‌ی کد ناموفق بود.' });
  }
});

// POST /api/auth/admin-setup  (ساخت اولین حساب ادمین؛ فقط با کد مخفی ADMIN_SETUP_CODE)
router.post('/admin-setup', async (req, res) => {
  try {
    const { secretCode, name, email, password } = req.body;

    if (!process.env.ADMIN_SETUP_CODE || typeof secretCode !== 'string' || !safeEqual(secretCode, process.env.ADMIN_SETUP_CODE)) {
      return res.status(403).json({ error: 'کد مخفی نادرست است.' });
    }
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
      return res.status(400).json({ error: 'نام و نام خانوادگی را وارد کنید.' });
    }
    if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 200) {
      return res.status(400).json({ error: 'ایمیل معتبر نیست.' });
    }
    const pwError = passwordError(password);
    if (pwError) return res.status(400).json({ error: pwError });

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [normalizedEmail]);

    const passwordHash = await bcrypt.hash(password, 12);

    if (existing.rows.length > 0) {
      // اگر این ایمیل قبلاً به‌عنوان کاربر عادی ثبت شده بود، نقشش را به ادمین ارتقا بده
      await pool.query('UPDATE users SET role = $1, password_hash = $2, name = $3 WHERE id = $4', ['admin', passwordHash, name.trim(), existing.rows[0].id]);
    } else {
      await pool.query(
        `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')`,
        [name.trim(), normalizedEmail, passwordHash]
      );
    }

    res.status(201).json({ created: true });
  } catch (err) {
    console.error('خطا در ساخت حساب ادمین:', err);
    res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'کاربر پیدا نشد.' });
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('خطا در دریافت اطلاعات کاربر:', err);
    res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
  }
});

// POST /api/auth/logout  (کوکی نشست را پاک می‌کند)
router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

module.exports = router;
