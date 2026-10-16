-- جدول کاربران: هسته‌ی سیستم احراز هویت
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(120)  NOT NULL,
  email           VARCHAR(255)  NOT NULL UNIQUE,
  password_hash   TEXT          NOT NULL,
  role            VARCHAR(20)   NOT NULL DEFAULT 'reader', -- reader | author | admin
  is_blocked      BOOLEAN       NOT NULL DEFAULT false,
  otp_code        VARCHAR(10),
  otp_expires_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (LOWER(email));

-- برای دیتابیس‌هایی که قبلاً جدول users را بدون این ستون‌ها ساخته‌اند
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_code VARCHAR(10);
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;

-- جدول آثار: کتاب‌ها، رمان‌ها و مقاله‌ها
CREATE TABLE IF NOT EXISTS items (
  id            SERIAL PRIMARY KEY,
  title         VARCHAR(255)  NOT NULL,
  author_name   VARCHAR(120)  NOT NULL,
  category      VARCHAR(20)   NOT NULL CHECK (category IN ('books', 'articles')),
  item_type     VARCHAR(60)   NOT NULL DEFAULT 'PDF',
  description   TEXT          NOT NULL DEFAULT '',
  cover_gradient VARCHAR(60)  NOT NULL DEFAULT 'from-rose-700 to-red-950',
  rating        NUMERIC(2,1)  NOT NULL DEFAULT 5.0,
  owner_id      INTEGER       REFERENCES users(id) ON DELETE SET NULL,
  pdf_filename  VARCHAR(255),
  audio_filename VARCHAR(255),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_items_category ON items (category);
CREATE INDEX IF NOT EXISTS idx_items_created_at ON items (created_at DESC);

-- برای دیتابیس‌هایی که قبلاً جدول items را بدون این ستون‌ها ساخته‌اند
ALTER TABLE items ADD COLUMN IF NOT EXISTS pdf_filename VARCHAR(255);
ALTER TABLE items ADD COLUMN IF NOT EXISTS audio_filename VARCHAR(255);

-- جدول نظرات کاربران روی هر اثر
CREATE TABLE IF NOT EXISTS comments (
  id          SERIAL PRIMARY KEY,
  item_id     INTEGER      NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id     INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  author_name VARCHAR(120) NOT NULL,
  content     TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_item_id ON comments (item_id, created_at DESC);

-- در گام‌های بعدی این جدول‌ها هم اضافه می‌شن:
-- comments (نظرات)، files (فایل صوتی/PDF)

-- ---------------------------------------------------------------------------
-- امتیازدهی کاربران به آثار (هر کاربر برای هر اثر فقط یک امتیاز دارد)
-- ---------------------------------------------------------------------------
ALTER TABLE items ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ALTER COLUMN rating SET DEFAULT 0;

CREATE TABLE IF NOT EXISTS ratings (
  id          SERIAL PRIMARY KEY,
  item_id     INTEGER      NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id     INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value       SMALLINT     NOT NULL CHECK (value BETWEEN 1 AND 5),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (item_id, user_id)
);

-- آثاری که هنوز هیچ امتیازی نگرفته‌اند، امتیازشان صفر باشد (نه عدد ثابت قدیمی ۵)
UPDATE items SET rating = 0 WHERE rating_count = 0;

-- ---------------------------------------------------------------------------
-- فروش آثار: قیمت نسخه‌ی دیجیتال و چاپی (به تومان) و جدول سفارش‌ها
-- ---------------------------------------------------------------------------
ALTER TABLE items ADD COLUMN IF NOT EXISTS price INTEGER NOT NULL DEFAULT 0;   -- ۰ = رایگان
ALTER TABLE items ADD COLUMN IF NOT EXISTS print_price INTEGER;                -- NULL = نسخه‌ی چاپی ندارد

CREATE TABLE IF NOT EXISTS orders (
  id          SERIAL PRIMARY KEY,
  item_id     INTEGER      REFERENCES items(id) ON DELETE SET NULL,
  item_title  VARCHAR(255) NOT NULL,
  seller_id   INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  buyer_id    INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  kind        VARCHAR(10)  NOT NULL CHECK (kind IN ('digital', 'print')),
  amount      INTEGER      NOT NULL,
  status      VARCHAR(10)  NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  authority   VARCHAR(64),
  ref_id      VARCHAR(64),
  ship_name    VARCHAR(120),
  ship_address TEXT,
  ship_phone   VARCHAR(20),
  shipped     BOOLEAN      NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  paid_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders (buyer_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders (seller_id, kind, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_authority ON orders (authority) WHERE authority IS NOT NULL;

-- ---------------------------------------------------------------------------
-- امنیت ورود: کد تأیید به‌صورت هش ذخیره می‌شود و تعداد تلاش‌های اشتباه شمارش می‌شود
-- ---------------------------------------------------------------------------
ALTER TABLE users ALTER COLUMN otp_code TYPE VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_attempts INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- تأیید ایمیل در ثبت‌نام: حساب‌های موجود تأییدشده فرض می‌شوند (ورودشان از قبل با کد ایمیلی بوده)
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT true;
