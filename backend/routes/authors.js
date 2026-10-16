const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireAuthor } = require('../middleware/authMiddleware');
const serializeItem = require('../utils/serializeItem');

const router = express.Router();

// PUT /api/authors/me  → ویرایش بیوگرافی خودِ نویسنده (باید قبل از ':id' بیاد)
router.put('/me', requireAuth, requireAuthor, async (req, res) => {
  try {
    const { bio } = req.body;
    const result = await pool.query(
      'UPDATE users SET bio = $1 WHERE id = $2 RETURNING id, name, bio',
      [(bio || '').trim(), req.user.id]
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('خطا در ذخیره‌ی بیوگرافی:', err);
    res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
  }
});

// GET /api/authors/:id  → پروفایل عمومی یک نویسنده + فهرست آثارش (برای همه، بدون نیاز به ورود)
router.get('/:id', async (req, res) => {
  try {
    const userResult = await pool.query(
      'SELECT id, name, bio, role, created_at FROM users WHERE id = $1',
      [req.params.id]
    );
    const author = userResult.rows[0];
    if (!author) return res.status(404).json({ error: 'نویسنده پیدا نشد.' });

    const itemsResult = await pool.query(
      'SELECT * FROM items WHERE owner_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );

    res.json({
      author: {
        id: author.id,
        name: author.name,
        bio: author.bio,
        role: author.role,
        joinedAt: author.created_at,
      },
      items: itemsResult.rows.map(serializeItem),
    });
  } catch (err) {
    console.error('خطا در دریافت پروفایل نویسنده:', err);
    res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
  }
});

module.exports = router;
