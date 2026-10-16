const pool = require('../db/pool');

// آیا این کاربر اجازه‌ی دیدن/شنیدن فایل‌های این اثر را دارد؟
//  - اثر رایگان: برای هر کاربر واردشده (مثل رفتار قبلی سایت)
//  - اثر پولی: فقط صاحب اثر، ادمین، یا کسی که «نسخه‌ی دیجیتال» را با پرداخت موفق خریده
// نکته: خرید نسخه‌ی چاپی دسترسی به فایل‌ها نمی‌دهد. اگر می‌خواهید بدهد، در کوئری
// پایین شرط kind = 'digital' را بردارید.
async function userHasAccess(user, item) {
  if (!item) return false;
  if (!(Number(item.price) > 0)) return true;
  if (!user) return false;
  if (user.role === 'admin' || item.owner_id === user.id) return true;
  const result = await pool.query(
    `SELECT 1 FROM orders
      WHERE buyer_id = $1 AND item_id = $2 AND kind = 'digital' AND status = 'paid'
      LIMIT 1`,
    [user.id, item.id]
  );
  return result.rowCount > 0;
}

module.exports = { userHasAccess };
