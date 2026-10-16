const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

// همه‌ی مسیرهای این فایل فقط برای ادمین (رئیس نویسندگان) در دسترس‌اند
router.use(requireAuth, requireAdmin);

function serializeUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isBlocked: row.is_blocked,
    createdAt: row.created_at,
  };
}

// GET /api/admin/users  → فهرست همه‌ی کاربران
router.get('/users', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, is_blocked, created_at FROM users ORDER BY created_at DESC'
    );
    res.json({ users: result.rows.map(serializeUser) });
  } catch (err) {
    console.error('خطا در دریافت فهرست کاربران:', err);
    res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
  }
});

// POST /api/admin/users/:id/block
router.post('/users/:id/block', async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'نمی‌توانید حساب خودتان را مسدود کنید.' });
    }
    const result = await pool.query(
      'UPDATE users SET is_blocked = true WHERE id = $1 RETURNING id, name, email, role, is_blocked, created_at',
      [targetId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'کاربر پیدا نشد.' });
    res.json({ user: serializeUser(result.rows[0]) });
  } catch (err) {
    console.error('خطا در مسدودسازی کاربر:', err);
    res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
  }
});

// POST /api/admin/users/:id/unblock
router.post('/users/:id/unblock', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE users SET is_blocked = false WHERE id = $1 RETURNING id, name, email, role, is_blocked, created_at',
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'کاربر پیدا نشد.' });
    res.json({ user: serializeUser(result.rows[0]) });
  } catch (err) {
    console.error('خطا در رفع مسدودیت کاربر:', err);
    res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
  }
});

// POST /api/admin/users/:id/role  { role: 'reader' | 'author' | 'admin' }
router.post('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!['reader', 'author', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'نقش نامعتبر است.' });
    }
    const targetId = Number(req.params.id);
    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'نمی‌توانید نقش خودتان را تغییر دهید.' });
    }
    const result = await pool.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, email, role, is_blocked, created_at',
      [role, targetId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'کاربر پیدا نشد.' });
    res.json({ user: serializeUser(result.rows[0]) });
  } catch (err) {
    console.error('خطا در تغییر نقش کاربر:', err);
    res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'نمی‌توانید حساب خودتان را حذف کنید.' });
    }
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [targetId]);
    if (!result.rows[0]) return res.status(404).json({ error: 'کاربر پیدا نشد.' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('خطا در حذف کاربر:', err);
    res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
  }
});

module.exports = router;
