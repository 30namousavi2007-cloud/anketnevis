// تبدیل یک ردیف جدول items به شکلی که فرانت‌اند می‌گیرد.
// (قبلاً این تابع هم در items.js و هم در authors.js تکرار شده بود.)
function serializeItem(row) {
  return {
    id: row.id,
    title: row.title,
    author: row.author_name,
    category: row.category,
    type: row.item_type,
    desc: row.description,
    coverBg: row.cover_gradient,
    rating: Number(row.rating),
    ratingCount: row.rating_count || 0,
    ownerId: row.owner_id,
    hasPdf: Boolean(row.pdf_filename),
    hasAudio: Boolean(row.audio_filename),
    price: Number(row.price) || 0,                                   // تومان؛ ۰ = رایگان
    printPrice: row.print_price == null ? null : Number(row.print_price), // تومان؛ null = نسخه‌ی چاپی ندارد
    createdAt: row.created_at,
  };
}

module.exports = serializeItem;
