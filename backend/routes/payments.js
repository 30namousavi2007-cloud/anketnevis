const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/authMiddleware');
const { userHasAccess } = require('../utils/access');
const zarinpal = require('../utils/zarinpal');
const { sendPrintOrderEmail } = require('../utils/mailer');

const router = express.Router();

function toEnglishDigits(value) {
  return String(value)
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

// اطلاعات ارسال سفارش چاپی را بررسی و پاکسازی می‌کند
function parseShipping(body) {
  const name = String(body?.name || '').trim();
  const address = String(body?.address || '').trim();
  const phone = toEnglishDigits(body?.phone || '').replace(/[\s\-()]/g, '');

  if (name.length < 3 || name.length > 120) return { error: 'نام و نام خانوادگی گیرنده را کامل وارد کنید.' };
  if (address.length < 15 || address.length > 1000) return { error: 'آدرس را کامل وارد کنید (استان، شهر، خیابان، پلاک و کد پستی).' };
  if (!/^\+?\d{8,15}$/.test(phone)) return { error: 'شماره تماس معتبر نیست.' };
  return { shipping: { name, address, phone } };
}

// آدرسی که زرین‌پال بعد از پرداخت کاربر را به آن برمی‌گرداند (باید روی همین بک‌اند باشد)
function callbackUrl() {
  const base = (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/+$/, '');
  return `${base}/api/payments/callback`;
}

// POST /api/payments/checkout  { itemId, kind: 'digital' | 'print', shipping?: { name, address, phone } }
// → { paymentUrl }   (فرانت کاربر را به paymentUrl هدایت می‌کند)
// مبلغ همیشه از دیتابیس خوانده می‌شود، نه از درخواست کاربر.
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const itemId = Number(req.body.itemId);
    const kind = req.body.kind;
    if (!Number.isInteger(itemId) || !['digital', 'print'].includes(kind)) {
      return res.status(400).json({ error: 'درخواست خرید نامعتبر است.' });
    }

    const itemResult = await pool.query('SELECT * FROM items WHERE id = $1', [itemId]);
    const item = itemResult.rows[0];
    if (!item) return res.status(404).json({ error: 'اثر مورد نظر پیدا نشد.' });
    if (item.owner_id === req.user.id) {
      return res.status(400).json({ error: 'نمی‌توانید اثر خودتان را بخرید.' });
    }

    let amount;
    let shipping = null;

    if (kind === 'digital') {
      if (!(Number(item.price) > 0)) {
        return res.status(400).json({ error: 'این اثر رایگان است و نیازی به خرید ندارد.' });
      }
      if (!item.pdf_filename && !item.audio_filename) {
        return res.status(400).json({ error: 'هنوز فایلی برای این اثر بارگذاری نشده و فعلاً قابل خرید نیست.' });
      }
      if (await userHasAccess(req.user, item)) {
        return res.status(409).json({ error: 'شما قبلاً نسخه‌ی دیجیتال این اثر را خریده‌اید.' });
      }
      amount = Number(item.price);
    } else {
      if (item.print_price == null) {
        return res.status(400).json({ error: 'این اثر نسخه‌ی چاپی ندارد.' });
      }
      const parsed = parseShipping(req.body.shipping);
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      shipping = parsed.shipping;
      amount = Number(item.print_price);
    }

    const orderResult = await pool.query(
      `INSERT INTO orders (item_id, item_title, seller_id, buyer_id, kind, amount, ship_name, ship_address, ship_phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [item.id, item.title, item.owner_id, req.user.id, kind, amount, shipping?.name || null, shipping?.address || null, shipping?.phone || null]
    );
    const orderId = orderResult.rows[0].id;

    try {
      const payment = await zarinpal.requestPayment({
        amountToman: amount,
        callbackUrl: callbackUrl(),
        description: `${kind === 'print' ? 'نسخه‌ی چاپی' : 'نسخه‌ی دیجیتال'} «${item.title}»`.slice(0, 400),
        email: req.user.email,
      });
      await pool.query('UPDATE orders SET authority = $1 WHERE id = $2', [payment.authority, orderId]);
      res.json({ paymentUrl: payment.url, orderId });
    } catch (gatewayErr) {
      console.error('خطا در اتصال به درگاه پرداخت:', gatewayErr);
      await pool.query("UPDATE orders SET status = 'failed' WHERE id = $1", [orderId]);
      res.status(502).json({ error: 'اتصال به درگاه پرداخت برقرار نشد. کمی بعد دوباره تلاش کنید.' });
    }
  } catch (err) {
    console.error('خطا در شروع پرداخت:', err);
    res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
  }
});

// GET /api/payments/callback?Authority=...&Status=OK|NOK
// کاربر بعد از پرداخت با مرورگرش به این آدرس می‌آید. اینجا حتماً باید پرداخت را از خود زرین‌پال
// تأیید (verify) کنیم؛ فقط به Status=OK در آدرس اعتماد نمی‌کنیم. بعد کاربر به سایت برمی‌گردد.
router.get('/callback', async (req, res) => {
  const client = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').replace(/\/+$/, '');
  const back = (state, order) => {
    const params = new URLSearchParams({ payment: state });
    if (order) {
      params.set('order', String(order.id));
      params.set('kind', order.kind);
      if (order.item_id) params.set('item', String(order.item_id));
    }
    res.redirect(`${client}/?${params.toString()}`);
  };

  try {
    const authority = String(req.query.Authority || '');
    const status = String(req.query.Status || '');
    if (!authority) return back('failed');

    const found = await pool.query('SELECT * FROM orders WHERE authority = $1', [authority]);
    const order = found.rows[0];
    if (!order) return back('failed');

    // کاربر صفحه را رفرش کرده یا برای بار دوم آمده: دوباره verify نکن
    if (order.status === 'paid') return back('ok', order);
    if (order.status === 'failed') return back('failed', order);

    if (status !== 'OK') {
      await pool.query("UPDATE orders SET status = 'failed' WHERE id = $1 AND status = 'pending'", [order.id]);
      return back('failed', order);
    }

    let verification;
    try {
      verification = await zarinpal.verifyPayment({ amountToman: order.amount, authority });
    } catch (verifyErr) {
      // مشکل شبکه: سفارش pending می‌ماند تا با بازگشت دوباره‌ی کاربر یا رفرش، دوباره تلاش شود
      console.error('خطا در تأیید پرداخت:', verifyErr);
      return back('error', order);
    }

    if (!verification.ok) {
      await pool.query("UPDATE orders SET status = 'failed' WHERE id = $1 AND status = 'pending'", [order.id]);
      return back('failed', order);
    }

    const updated = await pool.query(
      `UPDATE orders SET status = 'paid', ref_id = $2, paid_at = now()
        WHERE id = $1 AND status = 'pending'
        RETURNING *`,
      [order.id, verification.refId]
    );
    const paid = updated.rows[0];
    // اگر paid خالی باشد، درخواست هم‌زمان دیگری همین سفارش را قبلاً ثبت کرده؛ ایمیل دوباره نمی‌رود.
    if (paid && paid.kind === 'print') {
      notifyPrintOrder(paid).catch((err) => console.error('خطا در ارسال ایمیل سفارش چاپی:', err));
    }
    return back('ok', order);
  } catch (err) {
    console.error('خطا در برگشت از درگاه:', err);
    return back('error');
  }
});

// اطلاع‌رسانی ایمیلی سفارش چاپی به نویسنده‌ی اثر و همه‌ی ادمین‌ها (اگر ایمیل تنظیم باشد)
async function notifyPrintOrder(order) {
  const recipients = await pool.query(
    `SELECT DISTINCT email FROM users
      WHERE is_blocked = false AND (id = $1 OR role = 'admin')`,
    [order.seller_id]
  );
  const buyer = await pool.query('SELECT name, email FROM users WHERE id = $1', [order.buyer_id]);
  const emails = recipients.rows.map((r) => r.email);
  if (emails.length === 0) return;
  await sendPrintOrderEmail(emails, order, buyer.rows[0] || {});
}

// GET /api/payments/my  → خریدهای موفق کاربر واردشده
router.get('/my', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, item_id, item_title, kind, amount, ref_id, shipped, paid_at
         FROM orders
        WHERE buyer_id = $1 AND status = 'paid'
        ORDER BY paid_at DESC`,
      [req.user.id]
    );
    res.json({
      purchases: result.rows.map((r) => ({
        id: r.id,
        itemId: r.item_id,
        title: r.item_title,
        kind: r.kind,
        amount: r.amount,
        refId: r.ref_id,
        shipped: r.shipped,
        paidAt: r.paid_at,
      })),
    });
  } catch (err) {
    console.error('خطا در دریافت خریدها:', err);
    res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
  }
});

module.exports = router;
