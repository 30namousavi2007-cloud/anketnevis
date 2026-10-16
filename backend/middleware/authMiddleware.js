const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { getSessionToken } = require('../utils/session');

// توکن نشست از کوکی httpOnly خوانده می‌شود (نه از localStorage یا آدرس).
// بعد از اعتبارسنجی JWT، نقش و وضعیت بلاک‌بودن کاربر تازه از دیتابیس خوانده می‌شود
// و اطلاعات کاربر روی req.user گذاشته می‌شود.
async function requireAuth(req, res, next) {
  const token = getSessionToken(req);

  if (!token) {
    return res.status(401).json({ error: 'برای انجام این عملیات باید وارد حساب کاربری شوید.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const result = await pool.query('SELECT id, name, email, role, is_blocked FROM users WHERE id = $1', [payload.userId]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'حساب کاربری پیدا نشد.' });
    }
    if (user.is_blocked) {
      return res.status(403).json({ error: 'حساب کاربری شما مسدود شده است.' });
    }

    req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'نشست شما منقضی شده یا نامعتبر است. دوباره وارد شوید.' });
  }
}

// باید بعد از requireAuth استفاده شود. فقط نویسنده‌ها و ادمین اجازه عبور دارند.
function requireAuthor(req, res, next) {
  if (req.user.role !== 'author' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'فقط نویسندگان مجاز به انجام این کار هستند.' });
  }
  next();
}

// باید بعد از requireAuth استفاده شود. فقط ادمین (رئیس نویسندگان) اجازه عبور دارد.
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'این بخش فقط برای مدیریت سایت در دسترس است.' });
  }
  next();
}

module.exports = { requireAuth, requireAuthor, requireAdmin };
