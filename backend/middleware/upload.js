const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// در سرور واقعی UPLOAD_DIR را روی یک دیسک دائمی (Volume) بگذارید، وگرنه با هر دیپلوی فایل‌ها پاک می‌شوند
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, '..', 'uploads');

// اگر پوشه‌ی uploads وجود نداشته باشد، بسازش
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // اسم تصادفی و غیرقابل‌حدس، برای این‌که آدرس فایل قابل‌ حدس‌زدن نباشد
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const ALLOWED_PDF_TYPES = ['application/pdf'];
const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a'];

function fileFilter(req, file, cb) {
  if (file.fieldname === 'pdf' && !ALLOWED_PDF_TYPES.includes(file.mimetype)) {
    return cb(new Error('فایل باید از نوع PDF باشد.'));
  }
  if (file.fieldname === 'audio' && !ALLOWED_AUDIO_TYPES.includes(file.mimetype)) {
    return cb(new Error('فایل صوتی باید از نوع MP3, WAV یا مشابه باشد.'));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // ۵۰ مگابایت
});

module.exports = { upload, UPLOAD_DIR };
