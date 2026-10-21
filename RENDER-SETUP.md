# راهنمای مرحله‌به‌مرحله: Render رایگان + Supabase + Brevo

ترتیب کار مهم است. هر مرحله را کامل انجام دهید و بعد بروید مرحله‌ی بعد.

## مرحله ۱) تعویض رمزها (چون در اسکرین‌شات دیده شدند)
۱. در Supabase رمز دیتابیس را عوض کنید: Project Settings ← Database ← Reset database password.
۲. یک JWT_SECRET تصادفی بسازید. در ترمینال (PowerShell) این دستور را بزنید و خروجی را کپی کنید:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## مرحله ۲) دیتابیس (Supabase)
۱. در Supabase بروید به SQL Editor ← New query.
۲. کل محتوای فایل `backend/db/schema.sql` را paste و Run کنید. (چندبار اجرا کردنش بی‌خطر است و داده‌ها پاک نمی‌شوند.)
۳. اختیاری ولی توصیه‌شده: همین کار را با فایل `backend/db/supabase-rls.sql` انجام دهید.
۴. بروید به Storage ← New bucket. نام bucket را بگذارید `books` و گزینه‌ی Public را **خاموش** بگذارید.
۵. بروید به Project Settings ← API Keys و کلید secret (یا service_role) را کپی کنید. این کلید خیلی قدرتمند است؛ فقط در Render بگذارید، نه جای دیگر.

## مرحله ۳) ایمیل (Brevo) — اگر Brevo برای شما باز نمی‌شود به بخش «ایمیل بدون Brevo» همین فایل بروید
۱. در Brevo بروید به SMTP & API ← API Keys و یک کلید بسازید.
۲. بروید به Senders, Domains & Dedicated IPs ← Senders و ایمیلی را که مالکش هستید اضافه و تأیید کنید.
توضیح: ایمیل‌هایی که با فرستنده‌ی Gmail می‌روند ممکن است به پوشه‌ی spam بروند؛ با ایمیل روی دامنه‌ی شخصی بهتر است.

## مرحله ۴) بک‌اند (Render ← سرویس anketnevis ← Environment)
این متغیرها را اضافه یا اصلاح کنید (مقدارهای واقعی را جایگزین کنید):
```
NODE_ENV=production
JWT_SECRET=<خروجی دستور مرحله ۱>
DATABASE_URL=<آدرس Pooler از Supabase با رمز جدید>
BACKEND_URL=https://anketnevis.onrender.com
CLIENT_ORIGIN=https://anketnevis-1.onrender.com
DB_SSL_REJECT_UNAUTHORIZED=false
SUPABASE_URL=https://wvuozwncudcmbdehtbjq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<کلید مرحله ۲>
SUPABASE_BUCKET=books
BREVO_API_KEY=<کلید مرحله ۳>
MAIL_FROM_EMAIL=<ایمیل فرستنده‌ی تأییدشده در Brevo>
MAIL_FROM_NAME=آنکت‌نویس
ADMIN_SETUP_CODE=<یک رشته‌ی تصادفی حداقل ۱۶ کاراکتر>
TRUST_PROXY=1
```
بعد Save, rebuild, and deploy بزنید.

## مرحله ۵) فرانت (Render ← Static Site anketnevis-1)
۱. در Redirects/Rewrites یک قانون بسازید:
```
Source:      /api/*
Destination: https://anketnevis.onrender.com/api/*
Action:      Rewrite
```
۲. در Environment این دو متغیر را بگذارید:
```
VITE_API_URL=/
VITE_FILES_URL=https://anketnevis.onrender.com
```
۳. در Headers (برای مسیر /*) این هدرها را اضافه کنید:
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```
۴. Manual Deploy ← Clear build cache & deploy بزنید.

## مرحله ۶) آپلود کد
فایل‌های این پروژه را روی پوشه‌ی خودتان جایگزین کنید (فایل `.env` را دست نزنید) و در ترمینال:
```
git add .
git commit -m "security, supabase storage, brevo, password reset"
git push
```

## مرحله ۷) بررسی
۱. این آدرس را در مرورگر باز کنید و ببینید `status` برابر `ok` است و `ip` همان آی‌پی واقعی شماست (با یک سایت «what is my IP» مقایسه کنید):
```
https://anketnevis-1.onrender.com/api/health
```
اگر `ip` آی‌پی شما نبود، `TRUST_PROXY` را به `2` تغییر دهید و دوباره بررسی کنید.
۲. ثبت‌نام کنید، کد ایمیل را وارد کنید و وارد شوید. صفحه را رفرش کنید؛ باید وارد بمانید.
۳. با حساب ادمین (از مسیر admin-setup) یک نویسنده بسازید، یک اثر با PDF منتشر کنید. بعد یک Manual Deploy روی بک‌اند بزنید و ببینید PDF هنوز باز می‌شود.

## مرحله ۸) بیدار نگه داشتن سرویس رایگان
سرویس رایگان Render بعد از ۱۵ دقیقه بی‌استفاده خوابش می‌برد و اولین درخواست حدود ۵۰ ثانیه طول می‌کشد. با یک سرویس رایگان مثل UptimeRobot هر ۱۰ تا ۱۴ دقیقه این آدرس را بزنید:
```
https://anketnevis.onrender.com/api/health
```

## ایمیل بدون Brevo (رله‌ی Google Apps Script)
برای کسانی که به Brevo دسترسی ندارند. ایمیل‌ها از حساب جیمیل خودتان می‌روند. بهتر است یک جیمیل مخصوص سایت بسازید.
۱. به آدرس `script.google.com` بروید و `New project` بزنید.
۲. کد پیش‌فرض را پاک کنید و کل محتوای فایل `backend/mail-relay/Code.gs` را بچسبانید.
۳. چرخ‌دنده‌ی `Project Settings` ← بخش `Script properties` ← `Add script property`. نام را `MAIL_TOKEN` و مقدار را یک رشته‌ی تصادفی بگذارید (مثلاً خروجی `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"`).
۴. بالا سمت راست `Deploy` ← `New deployment` ← نوع `Web app`. مقدار `Execute as` را `Me` و `Who has access` را `Anyone` بگذارید و `Deploy` بزنید.
۵. اجازه‌ی دسترسی را بدهید (اگر هشدار «تأییدنشده» آمد: `Advanced` ← `Go to ... (unsafe)` ← `Allow`).
۶. آدرس `Web app URL` (که به `/exec` ختم می‌شود) را کپی کنید.
۷. در رندر (بک‌اند) این دو متغیر را بگذارید و دیگر `BREVO_API_KEY` و `MAIL_FROM_EMAIL` لازم نیست:
```
MAIL_RELAY_URL=آدرس مرحله ۶
MAIL_RELAY_TOKEN=همان مقدار MAIL_TOKEN
```
هر بار کد `Code.gs` را عوض کردید باید `Deploy` ← `Manage deployments` ← ویرایش ← نسخه‌ی جدید بسازید.
سقف ارسال جیمیل شخصی حدود ۱۰۰ گیرنده در روز است (ممکن است گوگل تغییرش دهد).
