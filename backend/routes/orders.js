const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireAuthor } = require('../middleware/authMiddleware');

const router = express.Router();

// همه‌ی مسیرهای این فایل فقط برای نویسنده‌ها و ادمین‌اند
router.use(requireAuth, requireAuthor);

function serializePrintOrder(row) {
  return {
    id: row.id,
    itemId: row.item_id,
    title: row.item_title,
    amount: row.amount,
    refId: row.ref_id,
    paidAt: row.paid_at,
    shipped: row.shipped,
    buyerName: row.buyer_name,
    buyerEmail: row.buyer_email,
    shipName: row.ship_name,
    shipAddress: row.ship_address,
    shipPhone: row.ship_phone,
  };
}

// GET /api/orders/print
//  - نویسنده: سفارش‌های چاپیِ پرداخت‌شده‌ی آثار خودش
//  - ادمین: همه‌ی سفارش‌های چاپیِ پرداخت‌شده
router.get('/print', async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const result = await pool.query(
      `SELECT o.*, b.name AS buyer_name, b.email AS buyer_email
         FROM orders o
         LEFT JOIN users b ON b.id = o.buyer_id
        WHERE o.kind = 'print' AND o.status = 'paid'
          AND ($1::boolean OR o.seller_id = $2)
        ORDER BY o.shipped ASC, o.paid_at DESC`,
      [isAdmin, req.user.id]
    );
    res.json({ orders: result.rows.map(serializePrintOrder) });
  } catch (err) {
    console.error('خطا در دریافت سفارش‌های چاپی:', err);
    res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
  }
});

// POST /api/orders/:id/shipped  { shipped: true | false }  → علامت‌گذاری «ارسال شد»
router.post('/:id/shipped', async (req, res) => {
  try {
    const shipped = req.body.shipped !== false;
    const isAdmin = req.user.role === 'admin';
    const result = await pool.query(
      `UPDATE orders SET shipped = $1
        WHERE id = $2 AND kind = 'print' AND status = 'paid'
          AND ($3::boolean OR seller_id = $4)
        RETURNING id, shipped`,
      [shipped, req.params.id, isAdmin, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'سفارش پیدا نشد.' });
    res.json({ id: result.rows[0].id, shipped: result.rows[0].shipped });
  } catch (err) {
    console.error('خطا در تغییر وضعیت ارسال:', err);
    res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
  }
});

module.exports = router;
