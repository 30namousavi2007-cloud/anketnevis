-- اختیاری ولی توصیه‌شده (فقط برای Supabase): در SQL Editor اجرا کنید.
-- جدول‌های schema در بخش public هستند و Supabase آن‌ها را از طریق REST API هم در دسترس می‌گذارد.
-- با فعال کردن RLS (بدون هیچ policy) دسترسی از طریق API عمومی کاملاً بسته می‌شود.
-- بک‌اند با کاربر postgres به دیتابیس وصل می‌شود که RLS را دور می‌زند، پس سایت تغییری حس نمی‌کند.
ALTER TABLE public.users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders   ENABLE ROW LEVEL SECURITY;
