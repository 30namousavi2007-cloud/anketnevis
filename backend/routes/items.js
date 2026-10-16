const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../db/pool');
const { requireAuth, requireAuthor } = require('../middleware/authMiddleware');
const { upload, UPLOAD_DIR } = require('../middleware/upload');
const serializeItem = require('../utils/serializeItem');
const { userHasAccess } = require('../utils/access');
const { createSignedPath, verifySigned } = require('../utils/signedUrl');
const { isRealPdf, audioKind, AUDIO_MIME } = require('../utils/fileSignature');
const streamFile = require('../utils/streamFile');

const router = express.Router();

// شناسه‌ی اثر باید عدد باشد؛ وگرنه دیتابیس خطای ۵۰۰ می‌دهد
router.param('id', (req, res, next, id) => {
  if (!/^\d{1,9}$/.test(id)) return res.status(404).json({ error: 'اثر مورد نظر پیدا نشد.' });
  next();
});

const VALID_CATEGORIES = ['books', 'articles'];

// قیمت‌ها به تومان. price خالی/۰ = رایگان. printPrice خالی = نسخه‌ی چاپی ندارد.
function parsePrices(body) {
  const rawPrice = body.price === '' || body.price == null ? 0 : Number(body.price);
  if (!Number.isInteger(rawPrice) || rawPrice < 0 || rawPrice > 100000000) {
    return { error: 'قیمت نسخه‌ی دیجیتال باید عددی صحیح و حداقل ۰ باشد (۰ یعنی رایگان).' };
  }
  let printPrice = null;
  if (body.printPrice !== '' && body.printPrice != null) {
    printPrice = Number(body.printPrice);
    if (!Number.isInteger(printPrice) || printPrice < 1000 || printPrice > 100000000) {
      return { error: 'قیمت نسخه‌ی چاپی باید حداقل ۱۰۰۰ تومان باشد (یا خالی بگذارید).' };
    }
  }
  return { price: rawPrice, printPrice };
}

// قبل از پخش فایل، مطمئن می‌شود کاربر اجازه‌ی دسترسی به اثر را دارد (رایگان، صاحب، ادمین یا خریدار)
async function checkFileAccess(req, res, columns) {
  const result = await pool.query(`SELECT id, owner_id, price, ${columns} FROM items WHERE id = $1`, [req.params.id]);
  const item = result.rows[0];
  if (!item) {
    res.status(404).json({ error: 'اثر مورد نظر پیدا نشد.' });
    return null;
  }
  if (!(await userHasAccess(req.user, item))) {
    res.status(403).json({ error: 'برای دسترسی به فایل‌های این اثر باید نسخه‌ی دیجیتال آن را بخرید.' });
    return null;
  }
  return item;
}

// حذف امن یک فایل قدیمی از دیسک (اگر وجود داشته باشد)
function deleteFileIfExists(filename) {
  if (!filename) return;
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') console.error('خطا در حذف فایل قدیمی:', err);
  });
}

// GET /api/items?category=books|articles  → فهرست آثار (برای همه، حتی بدون ورود)
router.get('/', async (req, res) => {
  try {
    const { category, q } = req.query;
    const search = String(q || '').trim().slice(0, 100);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const conditions = [];
    const params = [];

    if (category && VALID_CATEGORIES.includes(category)) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      conditions.push(`(title ILIKE $${idx} OR author_name ILIKE $${idx} OR description ILIKE $${idx})`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM items ${whereClause}`, params);
    const result = await pool.query(
      `SELECT * FROM items ${whereClause} ORDER BY created_at DESC, id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({ items: result.rows.map(serializeItem), total: countResult.rows[0].total });
  } catch (err) {
    console.error('خطا در دریافت آثار:', err);
    res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
  }
});

// GET /api/items/:id  → جزئیات یک اثر
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM items WHERE id = $1', [id]);
    const item = result.rows[0];
    if (!item) return res.status(404).json({ error: 'اثر مورد نظر پیدا نشد.' });
    res.json({ item: serializeItem(item) });
  } catch (err) {
    console.error('خطا در دریافت اثر:', err);
    res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
  }
});

// POST /api/items  → انتشار اثر جدید (فقط برای کاربران واردشده)
router.post('/', requireAuth, requireAuthor, async (req, res) => {
  try {
    const { title, category, description } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'عنوان اثر را وارد کنید.' });
    }
    if (!category || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'دسته‌بندی معتبر نیست.' });
    }

    const prices = parsePrices(req.body);
    if (prices.error) return res.status(400).json({ error: prices.error });

    const itemType = category === 'books' ? 'صوتی و PDF' : 'مقاله PDF';
    const coverGradient = category === 'books'
      ? 'from-rose-700 to-red-950'
      : 'from-stone-700 to-zinc-900';

    const result = await pool.query(
      `INSERT INTO items (title, author_name, category, item_type, description, cover_gradient, rating, owner_id, price, print_price)
       VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9)
       RETURNING *`,
      [
        title.trim(),
        req.user.name,
        category,
        itemType,
        (description || '').trim(),
        coverGradient,
        req.user.id,
        prices.price,
        prices.printPrice,
      ]
    );

    res.status(201).json({ item: serializeItem(result.rows[0]) });
  } catch (err) {
    console.error('خطا در انتشار اثر:', err);
    res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
  }
});

// POST /api/items/:id/files  → آپلود فایل PDF و/یا صوتی برای یک اثر (فقط برای صاحب اثر)
router.post('/:id/files', requireAuth, async (req, res) => {
  // اول مالکیت بررسی می‌شود، بعد فایل روی دیسک نوشته می‌شود (تا کاربر غیرمجاز نتواند دیسک را پر کند)
  let item;
  try {
    const result = await pool.query('SELECT * FROM items WHERE id = $1', [req.params.id]);
    item = result.rows[0];
  } catch (err) {
    console.error('خطا در بررسی اثر:', err);
    return res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
  }
  if (!item) return res.status(404).json({ error: 'اثر مورد نظر پیدا نشد.' });
  if (item.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'شما اجازه‌ی ویرایش این اثر را ندارید.' });
  }

  upload.fields([{ name: 'pdf', maxCount: 1 }, { name: 'audio', maxCount: 1 }])(req, res, async (uploadErr) => {
    const uploaded = [...(req.files?.pdf || []), ...(req.files?.audio || [])];
    const discardUploaded = () => uploaded.forEach((f) => deleteFileIfExists(f.filename));

    if (uploadErr) {
      discardUploaded();
      const message = uploadErr.code === 'LIMIT_FILE_SIZE'
        ? 'حجم فایل بیشتر از ۵۰ مگابایت است.'
        : (uploadErr.message || 'خطا در آپلود فایل.');
      return res.status(400).json({ error: message });
    }
    try {
      const pdfFile = req.files?.pdf?.[0];
      const audioFile = req.files?.audio?.[0];

      if (!pdfFile && !audioFile) {
        return res.status(400).json({ error: 'حداقل یک فایل (PDF یا صوتی) انتخاب کنید.' });
      }

      // محتوای واقعی فایل بررسی می‌شود، نه فقط نوعی که مرورگر ادعا کرده
      if (pdfFile && !isRealPdf(path.join(UPLOAD_DIR, pdfFile.filename))) {
        discardUploaded();
        return res.status(400).json({ error: 'فایل انتخاب‌شده یک PDF معتبر نیست.' });
      }
      if (audioFile && !audioKind(path.join(UPLOAD_DIR, audioFile.filename))) {
        discardUploaded();
        return res.status(400).json({ error: 'فایل انتخاب‌شده یک فایل صوتی معتبر (MP3، WAV، OGG یا M4A) نیست.' });
      }

      const updateResult = await pool.query(
        `UPDATE items SET
           pdf_filename = COALESCE($1, pdf_filename),
           audio_filename = COALESCE($2, audio_filename)
         WHERE id = $3
         RETURNING *`,
        [pdfFile ? pdfFile.filename : null, audioFile ? audioFile.filename : null, req.params.id]
      );

      // فایل‌های قدیمی فقط بعد از ذخیره‌ی موفق فایل جدید حذف می‌شوند
      if (pdfFile) deleteFileIfExists(item.pdf_filename);
      if (audioFile) deleteFileIfExists(item.audio_filename);

      res.json({ item: serializeItem(updateResult.rows[0]) });
    } catch (err) {
      discardUploaded();
      console.error('خطا در ذخیره‌ی فایل:', err);
      res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
    }
  });
});

// GET /api/items/:id/file-url/:kind  (kind = pdf | audio)
// بعد از بررسی دسترسی (رایگان / صاحب اثر / ادمین / خریدار)، یک لینک امضاشده و کوتاه‌عمر برمی‌گرداند.
router.get('/:id/file-url/:kind', requireAuth, async (req, res) => {
  try {
    const { kind } = req.params;
    if (kind !== 'pdf' && kind !== 'audio') return res.status(404).json({ error: 'نوع فایل نامعتبر است.' });

    const column = kind === 'pdf' ? 'pdf_filename' : 'audio_filename';
    const item = await checkFileAccess(req, res, column);
    if (!item) return;
    if (!item[column]) return res.status(404).json({ error: 'فایلی برای این اثر یافت نشد.' });

    res.json({ url: createSignedPath(item.id, kind) });
  } catch (err) {
    console.error('خطا در ساخت لینک فایل:', err);
    res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
  }
});

// GET /api/items/:id/stream/:kind?exp=...&sig=...  → نمایش PDF یا پخش صوت (با Range)
// لینک فقط با امضای معتبر و منقضی‌نشده کار می‌کند؛ توکن ورود هیچ‌وقت در آدرس نمی‌آید.
router.get('/:id/stream/:kind', async (req, res) => {
  try {
    const { id, kind } = req.params;
    if (kind !== 'pdf' && kind !== 'audio') return res.status(404).json({ error: 'نوع فایل نامعتبر است.' });
    if (!verifySigned(id, kind, req.query.exp, req.query.sig)) {
      return res.status(403).json({ error: 'لینک فایل نامعتبر یا منقضی شده است. صفحه را دوباره باز کنید.' });
    }

    const column = kind === 'pdf' ? 'pdf_filename' : 'audio_filename';
    const result = await pool.query(`SELECT ${column} AS filename FROM items WHERE id = $1`, [id]);
    const filename = result.rows[0]?.filename;
    if (!filename) return res.status(404).json({ error: 'فایلی برای این اثر یافت نشد.' });

    const filePath = path.join(UPLOAD_DIR, path.basename(filename));
    if (kind === 'pdf') {
      return streamFile(req, res, filePath, { contentType: 'application/pdf', disposition: 'inline' });
    }
    let mime = 'audio/mpeg';
    try { mime = AUDIO_MIME[audioKind(filePath)] || mime; } catch (_) { /* فایل نیست؛ streamFile ۴۰۴ می‌دهد */ }
    return streamFile(req, res, filePath, { contentType: mime });
  } catch (err) {
    console.error('خطا در پخش فایل:', err);
    if (!res.headersSent) res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
  }
});

// PUT /api/items/:id  → ویرایش عنوان، دسته‌بندی و توضیحات (فقط صاحب اثر)
router.put('/:id', requireAuth, requireAuthor, async (req, res) => {
  try {
    const { title, category, description } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'عنوان اثر را وارد کنید.' });
    }
    if (!category || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'دسته‌بندی معتبر نیست.' });
    }

    const existing = await pool.query('SELECT owner_id FROM items WHERE id = $1', [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'اثر مورد نظر پیدا نشد.' });
    if (existing.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'فقط صاحب اثر می‌تواند آن را ویرایش کند.' });
    }

    const prices = parsePrices(req.body);
    if (prices.error) return res.status(400).json({ error: prices.error });

    const itemType = category === 'books' ? 'صوتی و PDF' : 'مقاله PDF';
    const coverGradient = category === 'books'
      ? 'from-rose-700 to-red-950'
      : 'from-stone-700 to-zinc-900';

    const result = await pool.query(
      `UPDATE items SET title = $1, category = $2, item_type = $3, cover_gradient = $4, description = $5,
              price = $6, print_price = $7
       WHERE id = $8
       RETURNING *`,
      [title.trim(), category, itemType, coverGradient, (description || '').trim(), prices.price, prices.printPrice, req.params.id]
    );

    res.json({ item: serializeItem(result.rows[0]) });
  } catch (err) {
    console.error('خطا در ویرایش اثر:', err);
    res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
  }
});

// DELETE /api/items/:id  → حذف اثر (صاحب اثر، یا ادمین برای مدیریت محتوا)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const existing = await pool.query('SELECT owner_id, pdf_filename, audio_filename FROM items WHERE id = $1', [req.params.id]);
    const item = existing.rows[0];
    if (!item) return res.status(404).json({ error: 'اثر مورد نظر پیدا نشد.' });

    const isOwner = item.owner_id === req.user.id;
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'شما اجازه‌ی حذف این اثر را ندارید.' });
    }

    // نظرات و امتیازهای این اثر خودکار همراهش حذف می‌شن (ON DELETE CASCADE)
    await pool.query('DELETE FROM items WHERE id = $1', [req.params.id]);

    deleteFileIfExists(item.pdf_filename);
    deleteFileIfExists(item.audio_filename);

    res.json({ deleted: true });
  } catch (err) {
    console.error('خطا در حذف اثر:', err);
    res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
  }
});

function serializeComment(row) {
  return {
    id: row.id,
    itemId: row.item_id,
    userId: row.user_id,
    author: row.author_name,
    content: row.content,
    createdAt: row.created_at,
  };
}

// GET /api/items/:id/comments  → فهرست نظرات یک اثر (برای همه، حتی بدون ورود)
router.get('/:id/comments', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM comments WHERE item_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json({ comments: result.rows.map(serializeComment) });
  } catch (err) {
    console.error('خطا در دریافت نظرات:', err);
    res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
  }
});

// POST /api/items/:id/comments  → ثبت نظر جدید (فقط برای کاربران واردشده)
router.post('/:id/comments', requireAuth, async (req, res) => {
  try {
    const { content } = req.body;
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'متن نظر نمی‌تواند خالی باشد.' });
    }
    if (content.trim().length > 2000) {
      return res.status(400).json({ error: 'نظر شما خیلی طولانی است (حداکثر ۲۰۰۰ کاراکتر).' });
    }

    const itemCheck = await pool.query('SELECT id FROM items WHERE id = $1', [req.params.id]);
    if (itemCheck.rows.length === 0) {
      return res.status(404).json({ error: 'اثر مورد نظر پیدا نشد.' });
    }

    const result = await pool.query(
      `INSERT INTO comments (item_id, user_id, author_name, content)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.params.id, req.user.id, req.user.name, content.trim()]
    );

    res.status(201).json({ comment: serializeComment(result.rows[0]) });
  } catch (err) {
    console.error('خطا در ثبت نظر:', err);
    res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
  }
});

// GET /api/items/:id/my-rating  → امتیازی که کاربر واردشده قبلاً به این اثر داده (یا null)
router.get('/:id/my-rating', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT value FROM ratings WHERE item_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ value: result.rows[0] ? result.rows[0].value : null });
  } catch (err) {
    console.error('خطا در دریافت امتیاز کاربر:', err);
    res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
  }
});

// POST /api/items/:id/rating  { value: 1..5 }  → ثبت یا ویرایش امتیاز کاربر
router.post('/:id/rating', requireAuth, async (req, res) => {
  try {
    const value = Number(req.body.value);
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      return res.status(400).json({ error: 'امتیاز باید عددی از ۱ تا ۵ باشد.' });
    }

    const itemResult = await pool.query('SELECT id, owner_id FROM items WHERE id = $1', [req.params.id]);
    const item = itemResult.rows[0];
    if (!item) return res.status(404).json({ error: 'اثر مورد نظر پیدا نشد.' });
    if (item.owner_id === req.user.id) {
      return res.status(403).json({ error: 'نمی‌توانید به اثر خودتان امتیاز بدهید.' });
    }

    await pool.query(
      `INSERT INTO ratings (item_id, user_id, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (item_id, user_id) DO UPDATE SET value = EXCLUDED.value`,
      [req.params.id, req.user.id, value]
    );

    // میانگین و تعداد امتیازها را دوباره حساب کن و روی خود اثر ذخیره کن
    const updated = await pool.query(
      `UPDATE items SET
         rating = COALESCE((SELECT ROUND(AVG(value)::numeric, 1) FROM ratings WHERE item_id = $1), 0),
         rating_count = (SELECT COUNT(*) FROM ratings WHERE item_id = $1)
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );

    res.json({ item: serializeItem(updated.rows[0]), myRating: value });
  } catch (err) {
    console.error('خطا در ثبت امتیاز:', err);
    res.status(500).json({ error: 'مشکلی در سرور پیش آمد.' });
  }
});

module.exports = router;
