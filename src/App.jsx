import React, { useState, useEffect } from 'react';
import {
  Sun, Moon, BookOpen, Volume2, Search, Star, FileText,
  MessageSquareQuote, ArrowLeft, Play, Pause, Lock, MessageSquare,
  Send, Filter, Plus, Upload, X, User, Mail, ShieldCheck, LayoutDashboard,
  LogOut, Loader2, AlertCircle, KeyRound, Shield, Ban, Trash2, Users, CheckCircle2,
  ShoppingCart, Package, CreditCard
} from 'lucide-react';

// ---------------------------------------------------------------------------
// لوگو: نسخه‌ی SVG برگرفته از لوگوی «آنکت‌نویس» (حرف A در بیضی قرمز + امضای وصل)
// ---------------------------------------------------------------------------
const LOGO_MARK_SRC = `${import.meta.env.BASE_URL}logo-mark.png`; // فایل در پوشه‌ی public (قبلاً base64 داخل کد بود)

function Logo({ size = 40, className = "" }) {
  return (
    <img
      src={LOGO_MARK_SRC}
      alt="نشان آنکت‌نویس"
      draggable={false}
      className={className}
      style={{ width: size, height: size, objectFit: "contain", display: "block" }}
    />
  );
}

// ---------------------------------------------------------------------------
// آدرس بک‌اند واقعی (Express + PostgreSQL). در توسعه‌ی محلی همین مقدار پیش‌فرض کافیست.
// اگر بک‌اند را جای دیگری دیپلوی کردید، یک فایل .env در ریشه‌ی فرانت‌اند بسازید و
// VITE_API_URL=https://your-backend-domain را در آن بگذارید.
// ---------------------------------------------------------------------------
// اگر کسی به‌اشتباه VITE_API_URL را با /api یا اسلش آخر بنویسد (https://x.onrender.com/api) خودکار اصلاح می‌شود،
// چون همه‌ی مسیرها خودشان با /api شروع می‌شوند.
// VITE_API_URL = «/» (یا خالی) یعنی API هم‌مبدأ با سایت است (Static Site با Rewrite مسیر /api به بک‌اند).
// اگر اصلاً تنظیم نشده باشد (اجرای محلی) به http://localhost:4000 وصل می‌شود.
const RAW_API_URL = import.meta.env?.VITE_API_URL;
const API_BASE_URL = (RAW_API_URL === undefined ? 'http://localhost:4000' : RAW_API_URL).replace(/\/+$/, '').replace(/\/api$/, '');
// آدرس پخش PDF و صوت؛ می‌تواند مستقیم به بک‌اند باشد (لینک امضاشده است و کوکی لازم ندارد) تا فایل‌های بزرگ از پروکسی Rewrite رد نشوند.
const FILES_BASE_URL = (import.meta.env?.VITE_FILES_URL || API_BASE_URL).replace(/\/+$/, '').replace(/\/api$/, '');
// نشست واقعی داخل کوکی httpOnly است و جاوااسکریپت به آن دسترسی ندارد (امن در برابر XSS).
// نسخه‌ی قدیمی سایت توکن را در localStorage می‌گذاشت؛ این کلید فقط برای پاک‌کردن آن است.
const LEGACY_TOKEN_KEY = 'anketnevis_token';
const LIST_PAGE_SIZE = 12; // تعداد آثاری که در هر لیست نشان داده می‌شود؛ «نمایش بیشتر» به همین اندازه اضافه می‌کند
const SESSION_MARK = 'session'; // فقط نشانه‌ی «وارد شده‌ام» در state؛ توکن واقعی نیست

// ---------------------------------------------------------------------------
// متن صفحه‌ی «درباره ما» — برای ویرایش، فقط همین بخش را تغییر دهید.
// ---------------------------------------------------------------------------
const ABOUT_CONTENT = {
  title: 'درباره‌ی آنکت‌نویس',
  tagline: 'خانه‌ی کتاب، صدا و اندیشه',
  paragraphs: [
    'آنکت‌نویس یک پلتفرم تولید و انتشار محتوای کتابی است؛ جایی برای دیده‌شدن رمان‌ها، کتاب‌های صوتی، مقاله‌ها و مجله‌های نویسندگان مستقل.',
    'ما باور داریم هر نویسنده‌ای باید بتواند اثرش را بدون واسطه‌های پیچیده به دست خوانندگانش برساند، و هر خواننده‌ای باید بتواند آثار تازه و ارزشمند را راحت پیدا کند.',
    'در آنکت‌نویس، آثار به‌صورت امن ارائه می‌شوند؛ خوانندگان می‌توانند فایل‌های صوتی را بشنوند و متن‌ها را مطالعه کنند، بی‌آنکه حقوق پدیدآورندگان نادیده گرفته شود.',
  ],
  values: [
    { title: 'حمایت از نویسندگان مستقل', text: 'بستری ساده برای انتشار کتاب، کتاب صوتی و مقاله.' },
    { title: 'امنیت محتوا', text: 'دسترسی کنترل‌شده به فایل‌ها برای حفظ حقوق پدیدآورندگان.' },
    { title: 'تجربه‌ی خواندن و شنیدن', text: 'مطالعه‌ی متن و پخش صوت در یک مکان، با رابطی روان.' },
  ],
};

// نمایش مبلغ به تومان با ارقام فارسی
function formatToman(amount) {
  return `${Number(amount || 0).toLocaleString('fa-IR')} تومان`;
}

async function apiRequest(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    credentials: 'include', // کوکی نشست
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'anketnevis', // محافظ CSRF؛ بک‌اند بدون آن درخواست‌های تغییردهنده را رد می‌کند
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (_) { /* بدنه‌ی خالی */ }
  if (!res.ok) {
    throw new Error((data && data.error) || 'خطای ناشناخته از سرور');
  }
  return data;
}

export default function App() {
  const [darkMode, setDarkMode] = useState(true);
  const [selectedBook, setSelectedBook] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showUserPanel, setShowUserPanel] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');

  // --- پنل مدیریت (فقط ادمین) ---
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState("");
  const [adminActionId, setAdminActionId] = useState(null); // id کاربری که الان روش عملیات در حال انجام است

  // --- صفحه‌ی مخفی ساخت حساب ادمین (?admin_setup=1 در آدرس) ---
  const [isAdminSetupPage] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).has('admin_setup');
  });
  const [adminSetupCode, setAdminSetupCode] = useState("");
  const [adminSetupName, setAdminSetupName] = useState("");
  const [adminSetupEmail, setAdminSetupEmail] = useState("");
  const [adminSetupPassword, setAdminSetupPassword] = useState("");
  const [adminSetupLoading, setAdminSetupLoading] = useState(false);
  const [adminSetupError, setAdminSetupError] = useState("");
  const [adminSetupSuccess, setAdminSetupSuccess] = useState(false);

  const [newComment, setNewComment] = useState("");
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState("");

  // هر بار یک اثر باز می‌شود، نظرات واقعی‌اش را از بک‌اند بگیر
  useEffect(() => {
    if (!selectedBook) { setComments([]); return; }
    setCommentsLoading(true);
    apiRequest(`/api/items/${selectedBook.id}/comments`)
      .then((data) => setComments(data.comments))
      .catch(() => setCommentError("دریافت نظرات با مشکل مواجه شد."))
      .finally(() => setCommentsLoading(false));
  }, [selectedBook?.id]);

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    setCommentError("");
    if (!newComment.trim()) return;
    if (!currentUser) { openAuth('login'); return; }

    setCommentSubmitting(true);
    try {
      const data = await apiRequest(`/api/items/${selectedBook.id}/comments`, {
        method: 'POST',
        body: { content: newComment.trim() },
      });
      setComments((prev) => [data.comment, ...prev]);
      setNewComment("");
    } catch (err) {
      setCommentError(err.message || "ثبت نظر با مشکل مواجه شد.");
    } finally {
      setCommentSubmitting(false);
    }
  };

  function formatCommentDate(iso) {
    try {
      return new Date(iso).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (_) {
      return '';
    }
  }

  // --- احراز هویت واقعی (با بک‌اند Express + PostgreSQL) ---
  const [currentUser, setCurrentUser] = useState(null); // {id, name, email, role}
  const [authToken, setAuthToken] = useState(null);
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [authStep, setAuthStep] = useState('credentials'); // credentials | otp
  const [otpCode, setOtpCode] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpResending, setOtpResending] = useState(false);
  const [otpMessage, setOtpMessage] = useState("");
  // فراموشی رمز عبور
  const [resetCode, setResetCode] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [authNotice, setAuthNotice] = useState("");

  // وقتی صفحه لود می‌شه، اگه توکن ذخیره‌شده‌ای هست، نشست کاربر رو بازیابی کن
  useEffect(() => {
    localStorage.removeItem(LEGACY_TOKEN_KEY); // توکن قدیمی را از مرورگر پاک کن
    apiRequest('/api/auth/me')
      .then((data) => {
        setAuthToken(SESSION_MARK);
        setCurrentUser(data.user);
      })
      .catch(() => { /* واردشده نیست */ })
      .finally(() => setCheckingSession(false));
  }, []);

  // فرم ثبت اثر جدید در پنل نویسنده
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("books");
  const [newDesc, setNewDesc] = useState("");
  const [newPrice, setNewPrice] = useState("");           // تومان؛ خالی یا ۰ = رایگان
  const [newPrintPrice, setNewPrintPrice] = useState(""); // تومان؛ خالی = نسخه‌ی چاپی ندارد

  const [allItems, setAllItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState("");

  // بارگذاری فهرست واقعی آثار از بک‌اند
  useEffect(() => {
    setItemsLoading(true);
    // سرور در هر درخواست حداکثر ۱۰۰ اثر می‌دهد؛ صفحه‌ها پشت‌سرهم گرفته می‌شوند
    (async () => {
      try {
        let all = [];
        for (let page = 0; page < 100; page += 1) {
          const data = await apiRequest(`/api/items?limit=100&offset=${all.length}`);
          all = all.concat(data.items);
          if (data.items.length === 0 || all.length >= data.total) break;
        }
        setAllItems(all);
      } catch (_) {
        setItemsError("امکان دریافت فهرست آثار از سرور وجود نداشت.");
      } finally {
        setItemsLoading(false);
      }
    })();
  }, []);

  const testimonials = [
    { id: 1, name: "مریم علوی", role: "نویسنده مستقل", text: "امنیت پخش فایل‌های صوتی و عدم امکان دانلود مستقیم PDF در این سایت واقعاً خیال من رو راحت کرد." },
    { id: 2, name: "حسین ابراهیمی", role: "کاربر فعال", text: "تنوع کتاب‌های صوتی و رابط کاربری روان سایت فوق‌العاده است." },
    { id: 3, name: "دکتر کاظمی", role: "پژوهشگر", text: "بخش مقاله‌های علمی دسترسی به منابع نویسندگان مستقل رو بسیار ساده کرده." },
  ];

  const [archiveSort, setArchiveSort] = useState("newest"); // newest | oldest | rating

  function sortItems(items, sortBy) {
    const sorted = [...items];
    if (sortBy === "oldest") {
      sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else if (sortBy === "rating") {
      sorted.sort((a, b) => b.rating - a.rating);
    } else {
      sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return sorted;
  }

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null); // null یعنی در حالت جستجو نیستیم
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  // --- امتیازدهی ---
  const [myRating, setMyRating] = useState(null);
  const [ratingHover, setRatingHover] = useState(0);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingError, setRatingError] = useState("");

  // وقتی یک اثر باز می‌شود، امتیازی که این کاربر قبلاً داده را بگیر
  useEffect(() => {
    setMyRating(null);
    setRatingError("");
    if (!selectedBook || !currentUser || !authToken) return;
    if (selectedBook.ownerId === currentUser.id) return;
    apiRequest(`/api/items/${selectedBook.id}/my-rating`)
      .then((data) => setMyRating(data.value))
      .catch(() => {});
  }, [selectedBook?.id, currentUser?.id, authToken]);

  const handleRate = async (value) => {
    if (!currentUser) { openAuth('login'); return; }
    setRatingError("");
    setRatingSubmitting(true);
    try {
      const data = await apiRequest(`/api/items/${selectedBook.id}/rating`, {
        method: 'POST',
        body: { value },
      });
      setMyRating(data.myRating);
      setSelectedBook(data.item);
      setAllItems((prev) => prev.map((i) => (i.id === data.item.id ? data.item : i)));
    } catch (err) {
      setRatingError(err.message || "ثبت امتیاز ناموفق بود.");
    } finally {
      setRatingSubmitting(false);
    }
  };

  // --- صفحه‌ی «درباره ما» و پروفایل نویسنده ---
  const [showAboutPage, setShowAboutPage] = useState(false);
  const [showAuthorPage, setShowAuthorPage] = useState(false);
  const [authorProfile, setAuthorProfile] = useState(null); // {author, items}
  const [authorProfileLoading, setAuthorProfileLoading] = useState(false);
  const [authorProfileError, setAuthorProfileError] = useState("");
  const [bioDraft, setBioDraft] = useState("");
  const [bioSaving, setBioSaving] = useState(false);
  const [bioMessage, setBioMessage] = useState("");

  const goHome = () => {
    setSelectedBook(null);
    setActiveCategory(null);
    setShowDashboard(false);
    setShowUserPanel(false);
    setShowAdminPanel(false);
    setShowAboutPage(false);
    setShowAuthorPage(false);
    setSearchResults(null);
    setSearchQuery("");
  };

  // کلیک روی لوگو/اسم سایت: صفحه‌ی «درباره ما»
  const openAbout = () => {
    goHome();
    setShowAboutPage(true);
  };

  // کلیک روی اسم یک نویسنده: صفحه‌ی پروفایل او
  const openAuthorProfile = async (ownerId) => {
    if (!ownerId) return;
    goHome();
    setShowAuthorPage(true);
    setAuthorProfile(null);
    setAuthorProfileError("");
    setAuthorProfileLoading(true);
    try {
      const data = await apiRequest(`/api/authors/${ownerId}`);
      setAuthorProfile(data);
    } catch (err) {
      setAuthorProfileError(err.message || "دریافت پروفایل نویسنده با مشکل مواجه شد.");
    } finally {
      setAuthorProfileLoading(false);
    }
  };

  const handleSaveBio = async () => {
    setBioSaving(true);
    setBioMessage("");
    try {
      await apiRequest('/api/authors/me', { method: 'PUT', body: { bio: bioDraft } });
      setBioMessage("بیوگرافی ذخیره شد.");
    } catch (err) {
      setBioMessage(err.message || "ذخیره‌ی بیوگرافی ناموفق بود.");
    } finally {
      setBioSaving(false);
    }
  };

  // وقتی نویسنده وارد داشبوردش می‌شود، بیوگرافی فعلی‌اش را برای ویرایش بارگذاری کن
  useEffect(() => {
    if (!showDashboard || !currentUser) return;
    apiRequest(`/api/authors/${currentUser.id}`)
      .then((data) => setBioDraft(data.author.bio || ""))
      .catch(() => {});
  }, [showDashboard, currentUser]);

  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    setSelectedBook(null);
    setActiveCategory(null);
    setShowDashboard(false);
    setSearchLoading(true);
    setSearchError("");
    try {
      const data = await apiRequest(`/api/items?q=${encodeURIComponent(query)}`);
      setSearchResults(data.items);
    } catch (err) {
      setSearchError("جستجو با مشکل مواجه شد. دوباره تلاش کنید.");
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const openAuth = (mode) => {
    setAuthError("");
    setAuthNotice("");
    setAuthMode(mode);
    setAuthStep('credentials');
    setOtpCode("");
    setOtpMessage("");
    setShowAuthModal(true);
  };

  // بسته به نقش کاربر، دکمه‌ی پنل یا به داشبورد نویسنده می‌ره یا پنل کاربری ساده
  const openDashboard = () => {
    goHome();
    if (!currentUser) {
      openAuth('login');
      return;
    }
    if (currentUser.role === 'author' || currentUser.role === 'admin') {
      setShowDashboard(true);
    } else {
      setShowUserPanel(true);
    }
  };

  const openAdminPanel = () => {
    goHome();
    if (!currentUser || currentUser.role !== 'admin') return;
    setShowAdminPanel(true);
    fetchAdminUsers();
  };

  const fetchAdminUsers = async () => {
    setAdminUsersLoading(true);
    setAdminUsersError("");
    try {
      const data = await apiRequest('/api/admin/users');
      setAdminUsers(data.users);
    } catch (err) {
      setAdminUsersError(err.message || "دریافت فهرست کاربران با مشکل مواجه شد.");
    } finally {
      setAdminUsersLoading(false);
    }
  };

  const handleAdminBlockToggle = async (user) => {
    setAdminActionId(user.id);
    try {
      const data = await apiRequest(`/api/admin/users/${user.id}/${user.isBlocked ? 'unblock' : 'block'}`, {
        method: 'POST',
      });
      setAdminUsers((prev) => prev.map((u) => (u.id === user.id ? data.user : u)));
    } catch (err) {
      setAdminUsersError(err.message || "عملیات ناموفق بود.");
    } finally {
      setAdminActionId(null);
    }
  };

  const handleAdminRoleChange = async (user, newRole) => {
    setAdminActionId(user.id);
    try {
      const data = await apiRequest(`/api/admin/users/${user.id}/role`, {
        method: 'POST',
        body: { role: newRole },
      });
      setAdminUsers((prev) => prev.map((u) => (u.id === user.id ? data.user : u)));
    } catch (err) {
      setAdminUsersError(err.message || "تغییر نقش ناموفق بود.");
    } finally {
      setAdminActionId(null);
    }
  };

  const handleAdminDelete = async (user) => {
    if (!window.confirm(`آیا از حذف کامل حساب «${user.name}» مطمئن هستید؟ این کار قابل بازگشت نیست.`)) return;
    setAdminActionId(user.id);
    try {
      await apiRequest(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      setAdminUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (err) {
      setAdminUsersError(err.message || "حذف کاربر ناموفق بود.");
    } finally {
      setAdminActionId(null);
    }
  };

  const handleAdminSetupSubmit = async (e) => {
    e.preventDefault();
    setAdminSetupError("");
    setAdminSetupLoading(true);
    try {
      await apiRequest('/api/auth/admin-setup', {
        method: 'POST',
        body: {
          secretCode: adminSetupCode,
          name: adminSetupName,
          email: adminSetupEmail,
          password: adminSetupPassword,
        },
      });
      setAdminSetupSuccess(true);
    } catch (err) {
      setAdminSetupError(err.message || "ساخت حساب ادمین ناموفق بود.");
    } finally {
      setAdminSetupLoading(false);
    }
  };

  // --- ثبت‌نام واقعی (از طریق بک‌اند) ---
  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError("");
    if (!authName || !authEmail || !authPassword) return;
    setAuthLoading(true);
    try {
      const data = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: { name: authName.trim(), email: authEmail.trim(), password: authPassword },
      });
      if (data.requiresOtp) {
        // حساب تا تأیید ایمیل فعال نیست؛ صفحه‌ی کد تأیید همان صفحه‌ی مرحله‌ی دوم ورود است
        setOtpEmail(data.email);
        setOtpCode("");
        setAuthMode('login');
        setAuthStep('otp');
        setOtpMessage(`برای تأیید ایمیل، کد شش‌رقمی ارسال‌شده به ${data.email} را وارد کنید.`);
        setAuthName(""); setAuthPassword("");
      }
    } catch (err) {
      setAuthError(err.message || "مشکلی در ثبت‌نام پیش آمد. دوباره تلاش کنید.");
    } finally {
      setAuthLoading(false);
    }
  };

  // --- ورود، مرحله‌ی اول: بررسی رمز عبور و ارسال کد تأیید به ایمیل ---
  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError("");
    if (!authEmail || !authPassword) return;
    setAuthLoading(true);
    try {
      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: { email: authEmail.trim(), password: authPassword },
      });
      if (data.requiresOtp) {
        setOtpEmail(data.email);
        setAuthStep('otp');
        setOtpMessage(`یک کد شش‌رقمی به ${data.email} ارسال شد.`);
      }
    } catch (err) {
      setAuthError(err.message || "مشکلی در ورود پیش آمد. دوباره تلاش کنید.");
    } finally {
      setAuthLoading(false);
    }
  };

  // --- ورود، مرحله‌ی دوم: بررسی کد ارسال‌شده به ایمیل ---
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setAuthError("");
    if (!otpCode.trim()) return;
    setAuthLoading(true);
    try {
      const data = await apiRequest('/api/auth/verify-otp', {
        method: 'POST',
        body: { email: otpEmail, code: otpCode.trim() },
      });
      setAuthToken(SESSION_MARK);
      setCurrentUser(data.user);
      setShowAuthModal(false);
      setAuthEmail(""); setAuthPassword(""); setOtpCode(""); setAuthStep('credentials');
    } catch (err) {
      setAuthError(err.message || "کد تأیید نامعتبر است.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setAuthError("");
    setOtpResending(true);
    try {
      await apiRequest('/api/auth/resend-otp', { method: 'POST', body: { email: otpEmail } });
      setOtpMessage(`کد جدیدی به ${otpEmail} ارسال شد.`);
    } catch (err) {
      setAuthError(err.message || "ارسال دوباره‌ی کد ناموفق بود.");
    } finally {
      setOtpResending(false);
    }
  };

  // ----- فراموشی رمز عبور: ایمیل ← کد بازیابی ← رمز جدید ← ورود -----
  const goForgot = () => {
    setAuthError("");
    setAuthNotice("");
    setAuthStep('forgot');
  };

  const requestResetCode = () =>
    apiRequest('/api/auth/forgot-password', { method: 'POST', body: { email: authEmail.trim() } });

  const handleForgot = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      await requestResetCode();
      setResetCode("");
      setResetPassword("");
      setOtpMessage(`اگر حسابی با ${authEmail.trim()} وجود داشته باشد، کد بازیابی به آن ایمیل ارسال شد.`);
      setAuthStep('reset');
    } catch (err) {
      setAuthError(err.message || "ارسال کد بازیابی ناموفق بود.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResendReset = async () => {
    setAuthError("");
    setOtpResending(true);
    try {
      await requestResetCode();
      setOtpMessage(`اگر حسابی وجود داشته باشد، کد جدیدی به ${authEmail.trim()} ارسال شد.`);
    } catch (err) {
      setAuthError(err.message || "ارسال دوباره‌ی کد ناموفق بود.");
    } finally {
      setOtpResending(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      await apiRequest('/api/auth/reset-password', {
        method: 'POST',
        body: { email: authEmail.trim(), code: resetCode.trim(), newPassword: resetPassword },
      });
      setAuthPassword("");
      setResetCode("");
      setResetPassword("");
      setAuthNotice("رمز عبور شما تغییر کرد. حالا با رمز جدید وارد شوید.");
      setAuthStep('credentials');
    } catch (err) {
      setAuthError(err.message || "تغییر رمز عبور ناموفق بود.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => { /* حتی اگر شبکه قطع بود، از state خارج می‌شویم */ });
    setAuthToken(null);
    setCurrentUser(null);
    goHome();
  };

  const [itemPublishing, setItemPublishing] = useState(false);
  const [itemPublishError, setItemPublishError] = useState("");
  const [newPdfFile, setNewPdfFile] = useState(null);
  const [newAudioFile, setNewAudioFile] = useState(null);

  // آپلود فایل‌های PDF/صوتی برای یک اثر که تازه ساخته شده
  async function uploadItemFiles(itemId, pdfFile, audioFile) {
    const formData = new FormData();
    if (pdfFile) formData.append('pdf', pdfFile);
    if (audioFile) formData.append('audio', audioFile);

    const res = await fetch(`${API_BASE_URL}/api/items/${itemId}/files`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Requested-With': 'anketnevis' },
      body: formData,
    });
    let data = null;
    try { data = await res.json(); } catch (_) { /* بدنه‌ی خالی */ }
    if (!res.ok) throw new Error((data && data.error) || 'خطا در آپلود فایل');
    return data.item;
  }

  const [editingItem, setEditingItem] = useState(null); // اگر مقدار داشته باشد، فرم در حالت «ویرایش» است
  const [deletingItemId, setDeletingItemId] = useState(null);

  // -------------------------------------------------------------------------
  // خرید و پرداخت (زرین‌پال)
  // -------------------------------------------------------------------------
  const [purchases, setPurchases] = useState([]);
  const [paymentNotice, setPaymentNotice] = useState(null); // { type: 'ok' | 'failed' | 'error', kind }
  const [pendingOpenItemId, setPendingOpenItemId] = useState(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [showPrintForm, setShowPrintForm] = useState(false);
  const [shipName, setShipName] = useState("");
  const [shipAddress, setShipAddress] = useState("");
  const [shipPhone, setShipPhone] = useState("");
  const [printOrders, setPrintOrders] = useState([]);
  const [printOrdersLoading, setPrintOrdersLoading] = useState(false);
  const [shippedBusyId, setShippedBusyId] = useState(null);

  // کاربر بعد از پرداخت به آدرس /?payment=ok&order=..&kind=..&item=.. برمی‌گردد
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const state = params.get('payment');
    if (!state) return;
    setPaymentNotice({ type: state, kind: params.get('kind') });
    const itemId = Number(params.get('item'));
    if (state === 'ok' && itemId) setPendingOpenItemId(itemId);
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const loadPurchases = async (token) => {
    try {
      const data = await apiRequest('/api/payments/my');
      setPurchases(data.purchases);
    } catch (_) { /* اگر نشد، فهرست خریدها خالی می‌ماند */ }
  };

  useEffect(() => {
    if (authToken) loadPurchases(authToken);
    else setPurchases([]);
  }, [authToken]);

  // بعد از خرید موفق، صفحه‌ی همان اثر باز می‌شود
  useEffect(() => {
    if (!pendingOpenItemId || itemsLoading) return;
    const item = allItems.find((i) => i.id === pendingOpenItemId);
    if (item) setSelectedBook(item);
    setPendingOpenItemId(null);
  }, [pendingOpenItemId, itemsLoading, allItems]);

  useEffect(() => {
    setShowPrintForm(false);
    setCheckoutError("");
  }, [selectedBook?.id]);

  // سفارش‌های چاپی در داشبورد نویسنده/ادمین
  useEffect(() => {
    if (!showDashboard || !authToken) return;
    setPrintOrdersLoading(true);
    apiRequest('/api/orders/print')
      .then((data) => setPrintOrders(data.orders))
      .catch(() => setPrintOrders([]))
      .finally(() => setPrintOrdersLoading(false));
  }, [showDashboard, authToken]);

  // آیا این کاربر می‌تواند PDF و صوت این اثر را ببیند؟ (اثر رایگان برای همه‌ی کاربران واردشده، اثر پولی فقط خریدار/صاحب/ادمین)
  const userCanOpenFiles = (item) => {
    if (!item) return false;
    if (!(item.price > 0)) return true;
    if (!currentUser) return false;
    if (currentUser.role === 'admin' || currentUser.id === item.ownerId) return true;
    return purchases.some((p) => p.itemId === item.id && p.kind === 'digital');
  };

  // «نمایش بیشتر» در لیست‌ها: فقط بخشی از آثار ساخته می‌شود تا صفحه با زیاد شدن آثار سنگین نشود
  const [listLimit, setListLimit] = useState(LIST_PAGE_SIZE);
  useEffect(() => {
    setListLimit(LIST_PAGE_SIZE);
  }, [activeCategory, archiveSort, searchResults, showDashboard, selectedBook?.id]);

  const renderShowMore = (total, className = "mt-8") =>
    total > listLimit ? (
      <div className={`flex justify-center ${className}`}>
        <button
          onClick={() => setListLimit((n) => n + LIST_PAGE_SIZE)}
          className={`px-6 py-3 rounded-xl border font-bold text-sm transition ${darkMode ? 'border-stone-700 hover:bg-stone-800' : 'border-stone-300 hover:bg-stone-100'}`}
        >
          نمایش بیشتر ({(total - listLimit).toLocaleString('fa-IR')} اثر دیگر)
        </button>
      </div>
    ) : null;

  // لینک‌های امضاشده‌ی کوتاه‌عمر برای PDF و صوت (توکن ورود هیچ‌وقت در آدرس فایل نمی‌آید)
  const [fileUrls, setFileUrls] = useState({ pdf: null, audio: null });
  const fileUrlsFetchedAt = React.useRef(0);
  const activeBookIdRef = React.useRef(null);
  activeBookIdRef.current = selectedBook?.id ?? null;

  const loadFileUrls = async () => {
    if (!selectedBook || !currentUser || !userCanOpenFiles(selectedBook)) {
      setFileUrls({ pdf: null, audio: null });
      return;
    }
    fileUrlsFetchedAt.current = Date.now();
    const bookId = selectedBook.id;
    const fetchUrl = async (kind, present) => {
      if (!present) return null;
      try {
        const data = await apiRequest(`/api/items/${bookId}/file-url/${kind}`);
        return data.url;
      } catch (_) {
        return null;
      }
    };
    const [pdf, audio] = await Promise.all([
      fetchUrl('pdf', selectedBook.hasPdf),
      fetchUrl('audio', selectedBook.hasAudio),
    ]);
    if (activeBookIdRef.current !== bookId) return; // کاربر در این فاصله اثر دیگری را باز کرده
    setFileUrls({ pdf, audio });
  };

  useEffect(() => {
    setFileUrls({ pdf: null, audio: null });
    loadFileUrls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBook?.id, selectedBook?.hasPdf, selectedBook?.hasAudio, currentUser?.id, purchases]);

  const startCheckout = async (item, kind, shipping) => {
    if (!currentUser) { openAuth('login'); return; }
    setCheckoutBusy(true);
    setCheckoutError("");
    try {
      const data = await apiRequest('/api/payments/checkout', {
        method: 'POST',
        body: { itemId: item.id, kind, shipping },
      });
      window.location.href = data.paymentUrl; // انتقال به صفحه‌ی پرداخت زرین‌پال
    } catch (err) {
      setCheckoutError(err.message || 'شروع پرداخت ناموفق بود.');
      setCheckoutBusy(false);
    }
  };

  const handlePrintCheckout = (e) => {
    e.preventDefault();
    startCheckout(selectedBook, 'print', { name: shipName, address: shipAddress, phone: shipPhone });
  };

  const handleToggleShipped = async (order) => {
    setShippedBusyId(order.id);
    try {
      const data = await apiRequest(`/api/orders/${order.id}/shipped`, {
        method: 'POST',
        body: { shipped: !order.shipped },
      });
      setPrintOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, shipped: data.shipped } : o)));
    } catch (err) {
      window.alert(err.message || 'تغییر وضعیت ارسال ناموفق بود.');
    } finally {
      setShippedBusyId(null);
    }
  };

  const openPurchasedItem = (purchase) => {
    const item = allItems.find((i) => i.id === purchase.itemId);
    if (!item) { window.alert('این اثر دیگر در سایت موجود نیست.'); return; }
    goHome();
    setSelectedBook(item);
  };

  const inputCls = `w-full p-3 rounded-xl border outline-none text-sm ${darkMode ? 'bg-stone-950 border-stone-800 focus:border-rose-600' : 'bg-stone-50 border-stone-300 focus:border-rose-600'}`;

  // فهرست خریدهای کاربر (در پنل کاربری و داشبورد نویسنده)
  const purchasesSection = (
    <div className="mt-8">
      <h2 className="text-lg font-bold mb-4 border-r-4 brand-border pr-3 flex items-center gap-2">
        <ShoppingCart className="w-5 h-5 brand-text" />
        خریدهای من
      </h2>
      {purchases.length === 0 ? (
        <div className={`p-6 rounded-2xl border text-center text-sm text-stone-500 ${darkMode ? 'bg-stone-900/40 border-stone-800' : 'bg-white border-stone-200'}`}>
          هنوز خریدی انجام نداده‌اید.
        </div>
      ) : (
        <div className="space-y-3">
          {purchases.map((p) => (
            <div key={p.id} className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-2 ${darkMode ? 'bg-stone-900/60 border-stone-800' : 'bg-white border-stone-200'}`}>
              <div className="min-w-0">
                <button onClick={() => openPurchasedItem(p)} className="font-bold text-sm hover:underline text-right">{p.title}</button>
                <p className="text-xs text-stone-500 mt-1">
                  {p.kind === 'print' ? 'نسخه‌ی چاپی' : 'نسخه‌ی دیجیتال'} · {formatToman(p.amount)}
                  {p.refId ? ` · کد رهگیری ${p.refId}` : ''}
                </p>
              </div>
              {p.kind === 'print' && (
                <span className={`text-xs font-semibold px-3 py-1 rounded-lg shrink-0 ${p.shipped ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                  {p.shipped ? 'ارسال شد' : 'در انتظار ارسال'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const resetItemForm = () => {
    setEditingItem(null);
    setNewTitle("");
    setNewDesc("");
    setNewPrice("");
    setNewPrintPrice("");
    setNewCategory("books");
    setNewPdfFile(null);
    setNewAudioFile(null);
    setItemPublishError("");
  };

  // ورود به حالت ویرایش: فرم داشبورد با اطلاعات اثر پر می‌شود
  const startEditItem = (item) => {
    goHome();
    setShowDashboard(true);
    setEditingItem(item);
    setNewTitle(item.title);
    setNewCategory(item.category);
    setNewDesc(item.desc || "");
    setNewPrice(item.price > 0 ? String(item.price) : "");
    setNewPrintPrice(item.printPrice != null ? String(item.printPrice) : "");
    setNewPdfFile(null);
    setNewAudioFile(null);
    setItemPublishError("");
  };

  // به‌روزرسانی یک اثر در همه‌ی فهرست‌هایی که ممکن است در حافظه باشند
  const replaceItemEverywhere = (item) => {
    setAllItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
    setSelectedBook((prev) => (prev && prev.id === item.id ? item : prev));
    setSearchResults((prev) => (prev ? prev.map((i) => (i.id === item.id ? item : i)) : prev));
  };

  const handleCreateItem = async (e) => {
    e.preventDefault();
    setItemPublishError("");
    if (!newTitle.trim()) return;
    if (!currentUser) { openAuth('login'); return; }

    setItemPublishing(true);
    try {
      const payload = {
        title: newTitle.trim(),
        category: newCategory,
        description: newDesc.trim(),
        price: newPrice === "" ? 0 : Number(newPrice),
        printPrice: newPrintPrice === "" ? null : Number(newPrintPrice),
      };

      if (editingItem) {
        // --- حالت ویرایش ---
        const data = await apiRequest(`/api/items/${editingItem.id}`, { method: 'PUT', body: payload });
        let finalItem = data.item;
        if (newPdfFile || newAudioFile) {
          finalItem = await uploadItemFiles(editingItem.id, newPdfFile, newAudioFile);
        }
        replaceItemEverywhere(finalItem);
        resetItemForm();
        return;
      }

      // --- حالت انتشار اثر جدید ---
      const data = await apiRequest('/api/items', { method: 'POST', body: payload });
      let finalItem = data.item;
      if (newPdfFile || newAudioFile) {
        finalItem = await uploadItemFiles(data.item.id, newPdfFile, newAudioFile);
      }
      setAllItems((prev) => [finalItem, ...prev]);
      resetItemForm();
    } catch (err) {
      setItemPublishError(err.message || "مشکلی در ذخیره‌ی اثر پیش آمد. دوباره تلاش کنید.");
    } finally {
      setItemPublishing(false);
    }
  };

  const handleDeleteItem = async (item) => {
    if (!window.confirm(`آیا از حذف «${item.title}» مطمئن هستید؟ نظرات، امتیازها و فایل‌های این اثر هم برای همیشه پاک می‌شوند.`)) return;
    setDeletingItemId(item.id);
    try {
      await apiRequest(`/api/items/${item.id}`, { method: 'DELETE' });
      setAllItems((prev) => prev.filter((i) => i.id !== item.id));
      setSelectedBook((prev) => (prev && prev.id === item.id ? null : prev));
      setSearchResults((prev) => (prev ? prev.filter((i) => i.id !== item.id) : prev));
      setAuthorProfile((prev) => (prev ? { ...prev, items: prev.items.filter((i) => i.id !== item.id) } : prev));
      if (editingItem && editingItem.id === item.id) resetItemForm();
    } catch (err) {
      window.alert(err.message || "حذف اثر ناموفق بود.");
    } finally {
      setDeletingItemId(null);
    }
  };

  // صفحه‌ی مخفی ساخت حساب ادمین — فقط وقتی آدرس شامل ?admin_setup=... باشه نمایش داده می‌شه
  if (isAdminSetupPage) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4 bg-[#150c0e] text-stone-100"
        dir="rtl"
        style={{ '--brand-primary': '#C81E2C', fontFamily: "'Vazirmatn', system-ui, sans-serif" }}
      >
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800;900&display=swap'); .brand-text { color: var(--brand-primary); } .brand-bg { background-color: var(--brand-primary); }`}</style>

        <div className="w-full max-w-md p-6 rounded-3xl border border-stone-800 bg-stone-900">
          <div className="flex justify-center mb-4">
            <Logo size={44} />
          </div>
          <h1 className="text-xl font-black text-center mb-1">ساخت حساب ادمین</h1>
          <p className="text-xs text-stone-500 text-center mb-6">این صفحه فقط با کد مخفی قابل‌استفاده است و نباید لینکش جایی به‌اشتراک گذاشته شود.</p>

          {adminSetupSuccess ? (
            <div className="flex flex-col items-center gap-3 text-center py-6">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              <p className="text-sm text-stone-300">حساب ادمین با موفقیت ساخته شد. حالا می‌توانید از صفحه‌ی اصلی سایت، با همین ایمیل و رمز، وارد شوید.</p>
            </div>
          ) : (
            <form onSubmit={handleAdminSetupSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1">کد مخفی</label>
                <input
                  type="password"
                  value={adminSetupCode}
                  onChange={(e) => setAdminSetupCode(e.target.value)}
                  className="w-full py-3 px-3 rounded-xl border border-stone-800 bg-stone-950 outline-none text-sm focus:border-rose-600"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">نام و نام خانوادگی</label>
                <input
                  type="text"
                  value={adminSetupName}
                  onChange={(e) => setAdminSetupName(e.target.value)}
                  className="w-full py-3 px-3 rounded-xl border border-stone-800 bg-stone-950 outline-none text-sm focus:border-rose-600"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">ایمیل</label>
                <input
                  type="email"
                  value={adminSetupEmail}
                  onChange={(e) => setAdminSetupEmail(e.target.value)}
                  className="w-full py-3 px-3 rounded-xl border border-stone-800 bg-stone-950 outline-none text-sm focus:border-rose-600"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">رمز عبور</label>
                <input
                  type="password"
                  value={adminSetupPassword}
                  onChange={(e) => setAdminSetupPassword(e.target.value)}
                  minLength={8}
                  className="w-full py-3 px-3 rounded-xl border border-stone-800 bg-stone-950 outline-none text-sm focus:border-rose-600"
                  required
                />
              </div>

              {adminSetupError && (
                <div className="flex items-center gap-2 text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{adminSetupError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={adminSetupLoading}
                className="w-full py-3 brand-bg text-white rounded-xl font-bold hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {adminSetupLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                ساخت حساب ادمین
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-[#150c0e] text-stone-100' : 'bg-[#FAF6F2] text-stone-900'}`}
      dir="rtl"
      style={{
        '--brand-primary': '#C81E2C',
        '--brand-primary-dark': '#8f1420',
        fontFamily: "'Vazirmatn', system-ui, sans-serif"
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800;900&display=swap');
        .brand-text { color: var(--brand-primary); }
        .brand-bg { background-color: var(--brand-primary); }
        .brand-border { border-color: var(--brand-primary); }
        .spine-card { position: relative; overflow: hidden; }
        .spine-card::before {
          content: '';
          position: absolute;
          top: 0; right: 0; bottom: 0;
          width: 5px;
          background: var(--brand-primary);
          opacity: 0.85;
        }
      `}</style>

      {paymentNotice && (
        <div className="fixed bottom-4 inset-x-4 md:inset-x-auto md:right-6 md:w-96 z-50">
          <div className={`p-4 rounded-2xl border shadow-2xl flex items-start gap-3 text-sm ${
            paymentNotice.type === 'ok'
              ? (darkMode ? 'bg-emerald-950 border-emerald-800 text-emerald-200' : 'bg-emerald-50 border-emerald-200 text-emerald-900')
              : (darkMode ? 'bg-red-950 border-red-900 text-red-200' : 'bg-red-50 border-red-200 text-red-900')
          }`}>
            {paymentNotice.type === 'ok' ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
            <p className="flex-1 leading-7">
              {paymentNotice.type === 'ok'
                ? (paymentNotice.kind === 'print'
                    ? 'پرداخت با موفقیت انجام شد و سفارش نسخه‌ی چاپی شما ثبت شد. وضعیت ارسال را در «خریدهای من» می‌بینید.'
                    : 'پرداخت با موفقیت انجام شد. نسخه‌ی دیجیتال اثر برای شما باز شد.')
                : paymentNotice.type === 'error'
                  ? 'تأیید پرداخت با مشکل مواجه شد. اگر مبلغی از حساب شما کسر شده، چند دقیقه بعد صفحه را رفرش کنید یا با پشتیبانی تماس بگیرید.'
                  : 'پرداخت انجام نشد یا لغو شد. مبلغی از حساب شما کسر نشده است.'}
            </p>
            <button onClick={() => setPaymentNotice(null)} aria-label="بستن"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* هدر سایت */}
      <header className={`p-4 md:px-12 border-b ${darkMode ? 'border-stone-900 bg-[#150c0e]/90' : 'border-stone-200 bg-white/90'} backdrop-blur sticky top-0 z-40 flex justify-between items-center shadow-md`}>
        <div className="flex items-center gap-3 cursor-pointer" onClick={openAbout}>
          <Logo size={38} />
          <div className="flex flex-col leading-tight">
            <span className="text-xl font-black brand-text">آنکت‌نویس</span>
            <span className={`text-[10px] tracking-wide ${darkMode ? 'text-stone-500' : 'text-stone-400'}`}>خانه‌ی کتاب، صدا و اندیشه</span>
          </div>
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          <button
            onClick={openDashboard}
            className={`hidden sm:flex items-center gap-2 text-xs md:text-sm px-4 py-2.5 rounded-xl font-semibold border transition ${
              showDashboard || showUserPanel
                ? 'brand-bg text-white brand-border'
                : darkMode
                  ? 'border-stone-800 bg-stone-900/80 hover:bg-stone-900 text-stone-200'
                  : 'border-stone-300 bg-stone-100 hover:bg-stone-200 text-stone-700'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 brand-text" />
            <span>{currentUser && currentUser.role !== 'author' && currentUser.role !== 'admin' ? 'پنل کاربری' : 'پنل نویسندگان'}</span>
          </button>

          {currentUser?.role === 'admin' && (
            <button
              onClick={openAdminPanel}
              className={`hidden sm:flex items-center gap-2 text-xs md:text-sm px-4 py-2.5 rounded-xl font-semibold border transition ${
                showAdminPanel
                  ? 'brand-bg text-white brand-border'
                  : darkMode
                    ? 'border-stone-800 bg-stone-900/80 hover:bg-stone-900 text-stone-200'
                    : 'border-stone-300 bg-stone-100 hover:bg-stone-200 text-stone-700'
              }`}
            >
              <Shield className="w-4 h-4 brand-text" />
              <span>پنل مدیریت</span>
            </button>
          )}

          <button
            onClick={() => setDarkMode(!darkMode)}
            aria-label={darkMode ? 'تغییر به حالت روشن' : 'تغییر به حالت تیره'}
            className={`p-2.5 rounded-xl border transition ${darkMode ? 'border-stone-800 bg-stone-900 text-amber-400' : 'border-stone-300 bg-stone-100 text-stone-700'}`}
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {checkingSession ? (
            <div className="w-9 h-9 rounded-xl border border-stone-800/50 flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-stone-500" />
            </div>
          ) : currentUser ? (
            <div className="flex items-center gap-2">
              <div className={`hidden md:flex flex-col items-end leading-tight text-xs ${darkMode ? 'text-stone-300' : 'text-stone-700'}`}>
                <span className="font-bold">{currentUser.name}</span>
                <span className="text-stone-500">{currentUser.email}</span>
              </div>
              <button
                onClick={handleLogout}
                className={`flex items-center gap-2 text-xs md:text-sm px-3 md:px-4 py-2.5 rounded-xl font-semibold border transition ${darkMode ? 'border-stone-800 bg-stone-900/80 hover:bg-stone-900 text-stone-200' : 'border-stone-300 bg-stone-100 hover:bg-stone-200 text-stone-700'}`}
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">خروج</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => openAuth('login')}
              className="brand-bg text-white text-xs md:text-sm px-4 md:px-5 py-2.5 rounded-xl font-semibold hover:opacity-90 transition"
            >
              ورود / ثبت‌نام
            </button>
          )}
        </div>
      </header>

      {/* منوی سریع موبایل: دکمه‌های پنل در هدر زیر عرض sm پنهان‌اند، پس برای کاربر واردشده اینجا هم هست */}
      {currentUser && (
        <nav aria-label="منوی سریع" className={`sm:hidden flex gap-2 px-4 py-2 border-b ${darkMode ? 'border-stone-900' : 'border-stone-200'}`}>
          <button
            onClick={openDashboard}
            className={`flex-1 flex items-center justify-center gap-2 text-xs px-3 py-2.5 rounded-xl font-semibold border transition ${darkMode ? 'border-stone-800 bg-stone-900/80 text-stone-200' : 'border-stone-300 bg-stone-100 text-stone-700'}`}
          >
            <LayoutDashboard className="w-4 h-4 brand-text" />
            <span>{currentUser.role !== 'author' && currentUser.role !== 'admin' ? 'پنل کاربری' : 'پنل نویسندگان'}</span>
          </button>
          {currentUser.role === 'admin' && (
            <button
              onClick={openAdminPanel}
              className={`flex-1 flex items-center justify-center gap-2 text-xs px-3 py-2.5 rounded-xl font-semibold border transition ${darkMode ? 'border-stone-800 bg-stone-900/80 text-stone-200' : 'border-stone-300 bg-stone-100 text-stone-700'}`}
            >
              <Shield className="w-4 h-4 brand-text" />
              <span>پنل مدیریت</span>
            </button>
          )}
        </nav>
      )}

      {/* صفحه‌ی «درباره ما» */}
      {showAboutPage ? (
        <main className="max-w-3xl mx-auto p-4 md:p-8">
          <button
            onClick={goHome}
            className="flex items-center gap-2 text-sm brand-text font-bold mb-6 hover:underline"
          >
            <ArrowLeft className="w-4 h-4 rotate-180" />
            بازگشت به صفحه اصلی
          </button>

          <div className={`p-6 md:p-10 rounded-3xl border ${darkMode ? 'bg-stone-900/60 border-stone-800' : 'bg-white border-stone-200 shadow-sm'}`}>
            <div className="flex flex-col items-center text-center mb-8">
              <Logo size={80} />
              <h1 className="text-3xl font-black mt-4 mb-1">{ABOUT_CONTENT.title}</h1>
              <p className="text-sm brand-text">{ABOUT_CONTENT.tagline}</p>
            </div>

            <div className="space-y-4 mb-10">
              {ABOUT_CONTENT.paragraphs.map((p, i) => (
                <p key={i} className={`leading-8 text-sm md:text-base ${darkMode ? 'text-stone-300' : 'text-stone-700'}`}>{p}</p>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {ABOUT_CONTENT.values.map((v, i) => (
                <div key={i} className={`p-4 rounded-2xl border ${darkMode ? 'bg-stone-950/50 border-stone-800' : 'bg-stone-50 border-stone-200'}`}>
                  <h3 className="font-bold text-sm mb-2 brand-text">{v.title}</h3>
                  <p className={`text-xs leading-6 ${darkMode ? 'text-stone-400' : 'text-stone-600'}`}>{v.text}</p>
                </div>
              ))}
            </div>
          </div>
        </main>

      ) : showAuthorPage ? (

        /* پروفایل نویسنده */
        <main className="max-w-5xl mx-auto p-4 md:p-8">
          <button
            onClick={goHome}
            className="flex items-center gap-2 text-sm brand-text font-bold mb-6 hover:underline"
          >
            <ArrowLeft className="w-4 h-4 rotate-180" />
            بازگشت به صفحه اصلی
          </button>

          {authorProfileLoading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-stone-500 text-sm">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>در حال دریافت پروفایل...</span>
            </div>
          ) : authorProfileError ? (
            <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/10 px-4 py-3 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{authorProfileError}</span>
            </div>
          ) : authorProfile ? (
            <>
              <div className={`p-6 md:p-8 rounded-3xl border mb-8 ${darkMode ? 'bg-stone-900/60 border-stone-800' : 'bg-white border-stone-200 shadow-sm'}`}>
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold brand-bg text-white">
                    {authorProfile.author.name?.[0] || '?'}
                  </div>
                  <div>
                    <h1 className="text-2xl font-black">{authorProfile.author.name}</h1>
                    <p className="text-xs text-stone-500">
                      عضو از {new Date(authorProfile.author.joinedAt).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long' })}
                      {' · '}
                      {authorProfile.items.length} اثر منتشر شده
                    </p>
                  </div>
                </div>
                <p className={`text-sm leading-8 ${darkMode ? 'text-stone-300' : 'text-stone-700'}`}>
                  {authorProfile.author.bio || 'این نویسنده هنوز بیوگرافی‌ای ننوشته است.'}
                </p>
              </div>

              <h2 className="text-xl font-bold mb-6 border-r-4 brand-border pr-3">آثار این نویسنده</h2>
              {authorProfile.items.length === 0 ? (
                <div className="text-center py-12 text-stone-500 text-sm">هنوز اثری منتشر نشده است.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                  {authorProfile.items.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => { setShowAuthorPage(false); setSelectedBook(item); }}
                      className={`spine-card rounded-3xl p-5 border cursor-pointer transition duration-300 hover:-translate-y-1 hover:shadow-xl ${darkMode ? 'bg-stone-900/80 border-stone-800 hover:border-rose-700' : 'bg-white border-stone-200 hover:border-rose-400'}`}
                    >
                      <div className={`h-40 rounded-2xl bg-gradient-to-tr ${item.coverBg} mb-4 flex items-center justify-center text-white font-bold shadow-inner`}>
                        کاور اثر
                      </div>
                      <h3 className="font-bold text-lg mb-1">{item.title}</h3>
                      <span className="text-xs px-3 py-1 rounded-full bg-rose-600/10 brand-text font-medium border border-rose-600/20">
                        {item.type}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </main>

      ) : showAdminPanel ? (
        <main className="max-w-5xl mx-auto p-4 md:p-8">
          <button
            onClick={goHome}
            className="flex items-center gap-2 text-sm brand-text font-bold mb-6 hover:underline"
          >
            <ArrowLeft className="w-4 h-4 rotate-180" />
            بازگشت به صفحه اصلی
          </button>

          <h1 className="text-3xl font-black mb-2 border-r-4 brand-border pr-3">پنل مدیریت</h1>
          <p className={`text-sm mb-8 ${darkMode ? 'text-stone-400' : 'text-stone-600'}`}>مدیریت کاربران: بلاک، حذف و تغییر نقش</p>

          {adminUsersError && (
            <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/10 px-4 py-3 rounded-xl mb-6">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{adminUsersError}</span>
            </div>
          )}

          {adminUsersLoading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-stone-500 text-sm">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>در حال دریافت فهرست کاربران...</span>
            </div>
          ) : (
            <div className="space-y-3">
              {adminUsers.map((u) => (
                <div
                  key={u.id}
                  className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${darkMode ? 'bg-stone-900/60 border-stone-800' : 'bg-white border-stone-200 shadow-sm'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${darkMode ? 'bg-stone-800 text-stone-300' : 'bg-stone-100 text-stone-600'}`}>
                      {u.name?.[0] || '?'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{u.name}</span>
                        {u.isBlocked && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20">مسدود</span>
                        )}
                      </div>
                      <span className="text-xs text-stone-500">{u.email}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={u.role}
                      onChange={(e) => handleAdminRoleChange(u, e.target.value)}
                      disabled={adminActionId === u.id}
                      className={`text-xs px-2 py-2 rounded-lg border outline-none ${darkMode ? 'bg-stone-950 border-stone-800 text-stone-200' : 'bg-stone-50 border-stone-300'}`}
                    >
                      <option value="reader">خواننده</option>
                      <option value="author">نویسنده</option>
                      <option value="admin">ادمین</option>
                    </select>

                    <button
                      onClick={() => handleAdminBlockToggle(u)}
                      disabled={adminActionId === u.id}
                      className={`text-xs px-3 py-2 rounded-lg border font-semibold flex items-center gap-1.5 transition disabled:opacity-50 ${u.isBlocked ? 'border-emerald-600/40 text-emerald-500 hover:bg-emerald-500/10' : 'border-amber-600/40 text-amber-500 hover:bg-amber-500/10'}`}
                    >
                      {adminActionId === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : u.isBlocked ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                      <span>{u.isBlocked ? 'رفع مسدودیت' : 'مسدودسازی'}</span>
                    </button>

                    <button
                      onClick={() => handleAdminDelete(u)}
                      disabled={adminActionId === u.id}
                      className="text-xs px-3 py-2 rounded-lg border border-red-600/40 text-red-500 hover:bg-red-500/10 font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف</span>
                    </button>
                  </div>
                </div>
              ))}
              {adminUsers.length === 0 && (
                <div className="text-center py-16 text-stone-500 text-sm">هیچ کاربری ثبت نشده است.</div>
              )}
            </div>
          )}
        </main>

      ) : showUserPanel ? (

        /* پنل کاربری ساده (برای خواننده‌ها) */
        <main className="max-w-2xl mx-auto p-4 md:p-8">
          <button
            onClick={goHome}
            className="flex items-center gap-2 text-sm brand-text font-bold mb-6 hover:underline"
          >
            <ArrowLeft className="w-4 h-4 rotate-180" />
            بازگشت به صفحه اصلی
          </button>

          <div className={`p-6 md:p-8 rounded-3xl border ${darkMode ? 'bg-stone-900/60 border-stone-800' : 'bg-white border-stone-200 shadow-sm'}`}>
            <div className="flex items-center gap-4 mb-6">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold brand-bg text-white`}>
                {currentUser?.name?.[0] || '?'}
              </div>
              <div>
                <h1 className="text-xl font-black">{currentUser?.name}</h1>
                <p className="text-sm text-stone-500">{currentUser?.email}</p>
              </div>
            </div>

            <div className={`p-4 rounded-2xl border text-sm flex items-start gap-3 ${darkMode ? 'bg-rose-950/20 border-rose-900/40 text-rose-300' : 'bg-rose-50 border-rose-100 text-rose-800'}`}>
              <Users className="w-5 h-5 shrink-0 mt-0.5" />
              <span>شما به‌عنوان «خواننده» ثبت شده‌اید. برای انتشار کتاب یا مقاله، حساب شما باید توسط مدیریت سایت به «نویسنده» تبدیل بشه.</span>
            </div>
          </div>

          {purchasesSection}
        </main>

      ) : (

      /* ۱. پنل نویسنده */
      showDashboard ? (
        <main className="max-w-5xl mx-auto p-4 md:p-8">
          <button
            onClick={goHome}
            className="flex items-center gap-2 text-sm brand-text font-bold mb-6 hover:underline"
          >
            <ArrowLeft className="w-4 h-4 rotate-180" />
            بازگشت به صفحه اصلی
          </button>

          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-black mb-1 border-r-4 brand-border pr-3">داشبورد نویسنده</h1>
              <p className={`text-sm ${darkMode ? 'text-stone-400' : 'text-stone-600'}`}>خوش آمدید، {currentUser?.name} — آثار خود را اینجا مدیریت و منتشر کنید</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className={`md:col-span-2 p-6 rounded-3xl border ${darkMode ? 'bg-stone-900/60 border-stone-800' : 'bg-white border-stone-200 shadow-sm'}`}>
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2 brand-text">
                <Plus className="w-5 h-5" />
                {editingItem ? `ویرایش اثر: ${editingItem.title}` : 'انتشار اثر جدید'}
              </h3>

              <form onSubmit={handleCreateItem} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-2">عنوان اثر</label>
                  <input
                    type="text"
                    placeholder="مثلاً: داستان کوتاه زمستان"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className={`w-full p-3 rounded-xl border outline-none text-sm ${darkMode ? 'bg-stone-950 border-stone-800 focus:border-rose-600' : 'bg-stone-50 border-stone-300 focus:border-rose-600'}`}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-2">نام نویسنده / پدیدآور</label>
                    <input
                      type="text"
                      value={currentUser?.name || ""}
                      readOnly
                      className={`w-full p-3 rounded-xl border outline-none text-sm opacity-70 cursor-not-allowed ${darkMode ? 'bg-stone-950 border-stone-800' : 'bg-stone-100 border-stone-300'}`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-2">دسته‌بندی</label>
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      className={`w-full p-3 rounded-xl border outline-none text-sm ${darkMode ? 'bg-stone-950 border-stone-800 focus:border-rose-600' : 'bg-stone-50 border-stone-300 focus:border-rose-600'}`}
                    >
                      <option value="books">کتاب / رمان</option>
                      <option value="articles">مقاله / پژوهش</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-2">خلاصه توضیحات</label>
                  <textarea
                    rows="3"
                    placeholder="خلاصه‌ای از موضوع اثر..."
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    className={`w-full p-3 rounded-xl border outline-none text-sm ${darkMode ? 'bg-stone-950 border-stone-800 focus:border-rose-600' : 'bg-stone-50 border-stone-300 focus:border-rose-600'}`}
                  ></textarea>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-2">قیمت نسخه‌ی دیجیتال (تومان)</label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      inputMode="numeric"
                      placeholder="خالی یا ۰ = رایگان"
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                      className={inputCls}
                    />
                    <p className="text-[11px] text-stone-500 mt-1">اگر قیمت بگذارید، PDF و فایل صوتی فقط برای خریداران باز می‌شود.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-2">قیمت نسخه‌ی چاپی (تومان)</label>
                    <input
                      type="number"
                      min="1000"
                      step="1000"
                      inputMode="numeric"
                      placeholder="خالی = نسخه‌ی چاپی ندارد"
                      value={newPrintPrice}
                      onChange={(e) => setNewPrintPrice(e.target.value)}
                      className={inputCls}
                    />
                    <p className="text-[11px] text-stone-500 mt-1">خریدار نام، آدرس و تلفن می‌دهد و سفارش برای شما و ادمین ثبت می‌شود.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className={`p-5 rounded-2xl border-2 border-dashed text-center cursor-pointer block transition ${darkMode ? 'border-stone-800 bg-stone-950/40 hover:border-rose-700' : 'border-stone-300 bg-stone-50 hover:border-rose-400'}`}>
                    <Upload className="w-7 h-7 brand-text mx-auto mb-2 opacity-70" />
                    <p className="text-xs text-stone-400 mb-1">
                      {newPdfFile ? newPdfFile.name : 'انتخاب فایل PDF'}
                    </p>
                    <span className="text-[10px] text-stone-500">حداکثر ۵۰ مگابایت</span>
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => setNewPdfFile(e.target.files?.[0] || null)}
                    />
                  </label>

                  <label className={`p-5 rounded-2xl border-2 border-dashed text-center cursor-pointer block transition ${darkMode ? 'border-stone-800 bg-stone-950/40 hover:border-rose-700' : 'border-stone-300 bg-stone-50 hover:border-rose-400'}`}>
                    <Volume2 className="w-7 h-7 brand-text mx-auto mb-2 opacity-70" />
                    <p className="text-xs text-stone-400 mb-1">
                      {newAudioFile ? newAudioFile.name : 'انتخاب فایل صوتی (MP3)'}
                    </p>
                    <span className="text-[10px] text-stone-500">حداکثر ۵۰ مگابایت</span>
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => setNewAudioFile(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>

                {editingItem && (editingItem.hasPdf || editingItem.hasAudio) && (
                  <p className="text-xs text-stone-500">
                    این اثر از قبل {editingItem.hasPdf ? 'فایل PDF' : ''}{editingItem.hasPdf && editingItem.hasAudio ? ' و ' : ''}{editingItem.hasAudio ? 'فایل صوتی' : ''} دارد؛ اگر فایل جدیدی انتخاب کنید، جایگزین فایل قبلی می‌شود.
                  </p>
                )}

                {itemPublishError && (
                  <div className="flex items-center gap-2 text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{itemPublishError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={itemPublishing}
                  className="w-full py-3.5 brand-bg text-white rounded-xl font-bold hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {itemPublishing && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingItem ? 'ذخیره‌ی تغییرات' : 'انتشار نهایی اثر'}
                </button>
                {editingItem && (
                  <button
                    type="button"
                    onClick={resetItemForm}
                    className={`w-full py-3 rounded-xl font-semibold text-sm border transition ${darkMode ? 'border-stone-700 text-stone-300 hover:bg-stone-800' : 'border-stone-300 text-stone-600 hover:bg-stone-100'}`}
                  >
                    انصراف از ویرایش
                  </button>
                )}
              </form>
            </div>

            <div className="space-y-6">
              <div className={`p-6 rounded-3xl border ${darkMode ? 'bg-stone-900/60 border-stone-800' : 'bg-white border-stone-200 shadow-sm'}`}>
                <h4 className="text-sm font-bold text-stone-400 mb-3">بیوگرافی شما</h4>
                <textarea
                  rows="5"
                  placeholder="درباره‌ی خودتان بنویسید؛ این متن در صفحه‌ی پروفایل شما نمایش داده می‌شود..."
                  value={bioDraft}
                  onChange={(e) => setBioDraft(e.target.value)}
                  className={`w-full p-3 rounded-xl border outline-none text-sm mb-3 ${darkMode ? 'bg-stone-950 border-stone-800 focus:border-rose-600' : 'bg-stone-50 border-stone-300 focus:border-rose-600'}`}
                ></textarea>
                <button
                  onClick={handleSaveBio}
                  disabled={bioSaving}
                  className="w-full py-2.5 brand-bg text-white rounded-xl text-sm font-bold hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {bioSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  ذخیره‌ی بیوگرافی
                </button>
                {bioMessage && <p className="text-xs text-stone-500 mt-2 text-center">{bioMessage}</p>}
                <button
                  onClick={() => openAuthorProfile(currentUser.id)}
                  className="w-full mt-2 text-xs brand-text font-semibold hover:underline"
                >
                  مشاهده‌ی صفحه‌ی پروفایل من
                </button>
              </div>

              <div className={`p-6 rounded-3xl border ${darkMode ? 'bg-stone-900/60 border-stone-800' : 'bg-white border-stone-200 shadow-sm'}`}>
                <h4 className="text-sm font-bold text-stone-400 mb-2">آمار سریع</h4>
                <div className="text-3xl font-black brand-text mb-1">{allItems.length} اثر</div>
                <p className="text-xs text-stone-500">مجموع آثار منتشر شده روی سایت</p>
              </div>

              <div className={`p-6 rounded-3xl border ${darkMode ? 'bg-stone-900/60 border-stone-800' : 'bg-white border-stone-200 shadow-sm'}`}>
                <h4 className="text-sm font-bold text-stone-400 mb-4">وضعیت امنیت محتوا</h4>
                <div className="space-y-3 text-xs">
                  <div className="flex items-center gap-2 text-emerald-500">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>فایل‌ها فقط برای کاربران واردشده پخش می‌شوند</span>
                  </div>
                  <div className="flex items-center gap-2 text-emerald-500">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>لینک مستقیم دانلود به کاربران داده نمی‌شود</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* آثار منتشرشده‌ی خود نویسنده */}
          <div className="mt-10">
            <h2 className="text-xl font-bold mb-5 border-r-4 brand-border pr-3">آثار منتشرشده‌ی من</h2>
            {allItems.filter((i) => i.ownerId === currentUser?.id).length === 0 ? (
              <div className={`p-8 rounded-2xl border text-center text-sm text-stone-500 ${darkMode ? 'bg-stone-900/40 border-stone-800' : 'bg-white border-stone-200'}`}>
                هنوز اثری منتشر نکرده‌اید.
              </div>
            ) : (
              <div className="space-y-3">
                {allItems.filter((i) => i.ownerId === currentUser?.id).slice(0, listLimit).map((item) => (
                  <div
                    key={item.id}
                    className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${editingItem?.id === item.id ? 'border-rose-600' : darkMode ? 'bg-stone-900/60 border-stone-800' : 'bg-white border-stone-200 shadow-sm'}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-tr ${item.coverBg} shrink-0`} />
                      <div className="min-w-0">
                        <button onClick={() => setSelectedBook(item)} className="font-bold text-sm hover:underline truncate block max-w-full text-right">{item.title}</button>
                        <span className="text-xs text-stone-500">{item.type} · {item.price > 0 ? formatToman(item.price) : 'رایگان'}{item.printPrice != null ? ` · چاپی ${formatToman(item.printPrice)}` : ''} · {item.ratingCount > 0 ? `امتیاز ${item.rating.toFixed(1)} از ${item.ratingCount} نفر` : 'بدون امتیاز'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEditItem(item)}
                        className={`text-xs px-3 py-2 rounded-lg border font-semibold transition ${darkMode ? 'border-stone-700 hover:bg-stone-800' : 'border-stone-300 hover:bg-stone-100'}`}
                      >
                        ویرایش
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item)}
                        disabled={deletingItemId === item.id}
                        className="text-xs px-3 py-2 rounded-lg border border-red-600/40 text-red-500 hover:bg-red-500/10 font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                      >
                        {deletingItemId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        <span>حذف</span>
                      </button>
                    </div>
                  </div>
                ))}
                {renderShowMore(allItems.filter((i) => i.ownerId === currentUser?.id).length, "pt-3")}
              </div>
            )}
          </div>

          {/* سفارش‌های چاپیِ پرداخت‌شده */}
          <div className="mt-10">
            <h2 className="text-xl font-bold mb-5 border-r-4 brand-border pr-3 flex items-center gap-2">
              <Package className="w-5 h-5 brand-text" />
              سفارش‌های نسخه‌ی چاپی
            </h2>
            {printOrdersLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="w-5 h-5 animate-spin text-stone-500" /></div>
            ) : printOrders.length === 0 ? (
              <div className={`p-8 rounded-2xl border text-center text-sm text-stone-500 ${darkMode ? 'bg-stone-900/40 border-stone-800' : 'bg-white border-stone-200'}`}>
                هنوز سفارش چاپی پرداخت‌شده‌ای ثبت نشده است.
              </div>
            ) : (
              <div className="space-y-3">
                {printOrders.map((o) => (
                  <div key={o.id} className={`p-4 rounded-2xl border ${o.shipped ? 'opacity-70' : ''} ${darkMode ? 'bg-stone-900/60 border-stone-800' : 'bg-white border-stone-200 shadow-sm'}`}>
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                      <div className="text-sm leading-7 min-w-0">
                        <p className="font-bold">{o.title} <span className="text-xs font-normal text-stone-500">· {formatToman(o.amount)}</span></p>
                        <p><span className="text-stone-500">گیرنده:</span> {o.shipName} · <span dir="ltr">{o.shipPhone}</span></p>
                        <p className="break-words"><span className="text-stone-500">آدرس:</span> {o.shipAddress}</p>
                        <p className="text-xs text-stone-500">
                          خریدار: {o.buyerName || '—'}{o.buyerEmail ? ` (${o.buyerEmail})` : ''} · کد رهگیری پرداخت: {o.refId || '—'}
                          {o.paidAt ? ` · ${new Date(o.paidAt).toLocaleDateString('fa-IR')}` : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => handleToggleShipped(o)}
                        disabled={shippedBusyId === o.id}
                        className={`text-xs px-3 py-2 rounded-lg border font-semibold flex items-center gap-1.5 shrink-0 transition disabled:opacity-50 ${o.shipped ? (darkMode ? 'border-stone-700 hover:bg-stone-800' : 'border-stone-300 hover:bg-stone-100') : 'border-emerald-600/50 text-emerald-500 hover:bg-emerald-500/10'}`}
                      >
                        {shippedBusyId === o.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        {o.shipped ? 'برگرداندن به «ارسال نشده»' : 'علامت‌گذاری «ارسال شد»'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {purchasesSection}
        </main>
      ) : selectedBook ? (

        <main className="max-w-5xl mx-auto p-4 md:p-8">
          <button
            onClick={() => setSelectedBook(null)}
            className="flex items-center gap-2 text-sm brand-text font-bold mb-6 hover:underline"
          >
            <ArrowLeft className="w-4 h-4 rotate-180" />
            بازگشت به فهرست
          </button>

          <div className={`p-6 md:p-8 rounded-3xl border mb-8 spine-card ${darkMode ? 'bg-stone-900/60 border-stone-800' : 'bg-white border-stone-200 shadow-sm'}`}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className={`h-72 rounded-2xl bg-gradient-to-tr ${selectedBook.coverBg} flex items-center justify-center text-white font-black text-2xl shadow-xl`}>
                کاور اثر
              </div>

              <div className="md:col-span-2 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h1 className="text-3xl font-black">{selectedBook.title}</h1>
                    <span className="flex items-center gap-1 text-amber-500 font-bold bg-amber-500/10 px-3 py-1 rounded-xl">
                      <Star className="w-5 h-5 fill-amber-500" /> {selectedBook.ratingCount > 0 ? `${selectedBook.rating.toFixed(1)} (${selectedBook.ratingCount})` : 'بدون امتیاز'}
                    </span>
                  </div>
                  <p className={`text-sm mb-4 ${darkMode ? 'text-stone-400' : 'text-stone-600'}`}>نویسنده:{' '}
                    <button
                      onClick={() => openAuthorProfile(selectedBook.ownerId)}
                      disabled={!selectedBook.ownerId}
                      className="font-semibold brand-text hover:underline disabled:no-underline disabled:cursor-default"
                    >
                      {selectedBook.author}
                    </button>
                  </p>
                  <p className={`leading-relaxed text-sm md:text-base mb-6 ${darkMode ? 'text-stone-300' : 'text-stone-700'}`}>{selectedBook.desc}</p>

                  {/* ابزار مدیریت اثر: ویرایش برای صاحب اثر، حذف برای صاحب اثر و ادمین */}
                  {currentUser && (currentUser.id === selectedBook.ownerId || currentUser.role === 'admin') && (
                    <div className="flex items-center gap-2 mb-4">
                      {currentUser.id === selectedBook.ownerId && (
                        <button
                          onClick={() => startEditItem(selectedBook)}
                          className={`text-xs px-3 py-2 rounded-lg border font-semibold transition ${darkMode ? 'border-stone-700 hover:bg-stone-800' : 'border-stone-300 hover:bg-stone-100'}`}
                        >
                          ویرایش اثر
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteItem(selectedBook)}
                        disabled={deletingItemId === selectedBook.id}
                        className="text-xs px-3 py-2 rounded-lg border border-red-600/40 text-red-500 hover:bg-red-500/10 font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                      >
                        {deletingItemId === selectedBook.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        <span>حذف اثر</span>
                      </button>
                    </div>
                  )}

                  {/* امتیازدهی کاربر */}
                  <div className={`p-4 rounded-2xl border mb-6 ${darkMode ? 'bg-stone-950/50 border-stone-800' : 'bg-stone-50 border-stone-200'}`}>
                    {selectedBook.ownerId && currentUser?.id === selectedBook.ownerId ? (
                      <p className="text-xs text-stone-500">این اثر متعلق به شماست و نمی‌توانید به آن امتیاز بدهید.</p>
                    ) : !currentUser ? (
                      <div className="flex items-center justify-between text-xs text-stone-500">
                        <span>برای امتیازدادن به این اثر باید وارد حساب کاربری شوید.</span>
                        <button onClick={() => openAuth('login')} className="brand-text font-bold hover:underline">ورود</button>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs font-semibold mb-2">
                          {myRating ? `امتیاز شما: ${myRating} از ۵ (برای تغییر، دوباره انتخاب کنید)` : 'به این اثر امتیاز بدهید'}
                        </p>
                        <div className="flex items-center gap-1" onMouseLeave={() => setRatingHover(0)}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              disabled={ratingSubmitting}
                              onMouseEnter={() => setRatingHover(n)}
                              onClick={() => handleRate(n)}
                              className="p-0.5 disabled:opacity-60"
                              aria-label={`${n} ستاره`}
                            >
                              <Star className={`w-7 h-7 transition ${n <= (ratingHover || myRating || 0) ? 'fill-amber-500 text-amber-500' : 'text-stone-500'}`} />
                            </button>
                          ))}
                          {ratingSubmitting && <Loader2 className="w-4 h-4 animate-spin text-stone-500 mr-2" />}
                        </div>
                        {ratingError && <p className="text-xs text-red-500 mt-2">{ratingError}</p>}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  {/* خرید نسخه‌ی دیجیتال / چاپی */}
                  {(selectedBook.price > 0 || selectedBook.printPrice != null) && currentUser?.id !== selectedBook.ownerId && (
                    <div className={`p-4 rounded-2xl border mb-4 ${darkMode ? 'bg-stone-950/50 border-stone-800' : 'bg-stone-50 border-stone-200'}`}>
                      <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
                        <ShoppingCart className="w-4 h-4 brand-text" />
                        خرید این اثر
                      </h4>
                      <div className="flex flex-col sm:flex-row gap-2">
                        {selectedBook.price > 0 && (
                          userCanOpenFiles(selectedBook) ? (
                            <div className="flex-1 flex items-center gap-2 text-xs text-emerald-500 bg-emerald-500/10 px-3 py-2.5 rounded-xl">
                              <CheckCircle2 className="w-4 h-4 shrink-0" />
                              <span>نسخه‌ی دیجیتال برای شما باز است</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => startCheckout(selectedBook, 'digital')}
                              disabled={checkoutBusy}
                              className="flex-1 py-2.5 px-3 brand-bg text-white rounded-xl text-sm font-bold hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-70"
                            >
                              {checkoutBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                              خرید نسخه‌ی دیجیتال · {formatToman(selectedBook.price)}
                            </button>
                          )
                        )}
                        {selectedBook.printPrice != null && (
                          <button
                            onClick={() => { if (!currentUser) { openAuth('login'); return; } setShowPrintForm((v) => !v); }}
                            className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-bold border transition flex items-center justify-center gap-2 ${darkMode ? 'border-stone-700 hover:bg-stone-800' : 'border-stone-300 hover:bg-stone-100'}`}
                          >
                            <Package className="w-4 h-4" />
                            سفارش نسخه‌ی چاپی · {formatToman(selectedBook.printPrice)}
                          </button>
                        )}
                      </div>

                      {showPrintForm && selectedBook.printPrice != null && (
                        <form onSubmit={handlePrintCheckout} className="mt-4 space-y-3">
                          <input type="text" placeholder="نام و نام خانوادگی گیرنده" value={shipName} onChange={(e) => setShipName(e.target.value)} className={inputCls} required />
                          <input type="tel" dir="ltr" placeholder="شماره تماس (مثلاً 09121234567)" value={shipPhone} onChange={(e) => setShipPhone(e.target.value)} className={`${inputCls} text-right`} required />
                          <textarea rows="3" placeholder="آدرس کامل: استان، شهر، خیابان، پلاک و کد پستی" value={shipAddress} onChange={(e) => setShipAddress(e.target.value)} className={inputCls} required></textarea>
                          <button
                            type="submit"
                            disabled={checkoutBusy}
                            className="w-full py-2.5 brand-bg text-white rounded-xl text-sm font-bold hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-70"
                          >
                            {checkoutBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                            ثبت سفارش و پرداخت
                          </button>
                        </form>
                      )}

                      {checkoutError && (
                        <div className="flex items-center gap-2 text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg mt-3">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{checkoutError}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className={`p-3 rounded-xl border flex items-center gap-3 text-xs mb-4 ${darkMode ? 'bg-rose-950/30 border-rose-900/50 text-rose-300' : 'bg-rose-50 border-rose-100 text-rose-800'}`}>
                    <Lock className="w-4 h-4 shrink-0 brand-text" />
                    <span>محتوای این اثر مستقیماً قابل دانلود نیست و فقط از طریق همین صفحه، برای کاربران واردشده، قابل پخش/مشاهده است.</span>
                  </div>

                  {selectedBook.hasAudio ? (
                    !currentUser ? (
                      <div className={`p-4 rounded-2xl border text-xs flex items-center justify-between ${darkMode ? 'bg-stone-800/80 border-stone-700 text-stone-300' : 'bg-stone-100 border-stone-200 text-stone-600'}`}>
                        <span>برای پخش فایل صوتی باید وارد حساب کاربری شوید.</span>
                        <button onClick={() => openAuth('login')} className="brand-text font-bold hover:underline">ورود</button>
                      </div>
                    ) : !userCanOpenFiles(selectedBook) ? (
                      <div className={`p-4 rounded-2xl border text-xs flex items-center gap-3 ${darkMode ? 'bg-stone-800/80 border-stone-700 text-stone-300' : 'bg-stone-100 border-stone-200 text-stone-600'}`}>
                        <Lock className="w-4 h-4 shrink-0 brand-text" />
                        <span>این اثر پولی است؛ بعد از خرید نسخه‌ی دیجیتال، فایل صوتی برای شما باز می‌شود.</span>
                      </div>
                    ) : (
                      <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-stone-800/80 border-stone-700' : 'bg-stone-100 border-stone-200'}`}>
                        <div className="flex items-center gap-3 mb-2">
                          <Volume2 className="w-5 h-5 brand-text shrink-0" />
                          <h4 className="font-bold text-sm">پخش‌کننده‌ی صوتی</h4>
                        </div>
                        <audio
                          controls
                          controlsList="nodownload"
                          onContextMenu={(e) => e.preventDefault()}
                          className="w-full"
                          src={fileUrls.audio ? `${FILES_BASE_URL}${fileUrls.audio}` : undefined}
                          onError={() => { if (Date.now() - fileUrlsFetchedAt.current > 10000) loadFileUrls(); }}
                        >
                          مرورگر شما از پخش صوت پشتیبانی نمی‌کند.
                        </audio>
                      </div>
                    )
                  ) : (
                    <div className={`p-4 rounded-2xl border flex items-center gap-3 text-xs ${darkMode ? 'bg-stone-800/50 border-stone-700 text-stone-500' : 'bg-stone-100 border-stone-200 text-stone-500'}`}>
                      <Volume2 className="w-5 h-5 shrink-0" />
                      <span>فایل صوتی برای این اثر هنوز بارگذاری نشده است.</span>
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>

          <div className={`p-6 rounded-3xl border mb-8 ${darkMode ? 'bg-stone-900/40 border-stone-800' : 'bg-white border-stone-200 shadow-sm'}`}>
            <h3 className="text-xl font-bold mb-4 border-r-4 brand-border pr-3">پیش‌نمایش PDF</h3>
            {selectedBook.hasPdf ? (
              !currentUser ? (
                <div className={`p-4 rounded-2xl border text-xs flex items-center justify-between ${darkMode ? 'bg-stone-950 border-stone-800 text-stone-400' : 'bg-stone-50 border-stone-200 text-stone-600'}`}>
                  <span>برای مشاهده‌ی PDF باید وارد حساب کاربری شوید.</span>
                  <button onClick={() => openAuth('login')} className="brand-text font-bold hover:underline">ورود</button>
                </div>
              ) : !userCanOpenFiles(selectedBook) ? (
                <div className={`p-4 rounded-2xl border text-xs flex items-center gap-3 ${darkMode ? 'bg-stone-950 border-stone-800 text-stone-400' : 'bg-stone-50 border-stone-200 text-stone-600'}`}>
                  <Lock className="w-4 h-4 shrink-0 brand-text" />
                  <span>این اثر پولی است؛ بعد از خرید نسخه‌ی دیجیتال، PDF برای شما باز می‌شود.</span>
                </div>
              ) : (
                <iframe
                  title="پیش‌نمایش PDF"
                  src={fileUrls.pdf ? `${FILES_BASE_URL}${fileUrls.pdf}` : undefined}
                  className={`w-full rounded-2xl border ${darkMode ? 'border-stone-800' : 'border-stone-200'}`}
                  style={{ height: '70vh' }}
                />
              )
            ) : (
              <div className={`p-6 rounded-2xl border text-sm leading-8 select-none ${darkMode ? 'bg-stone-950 border-stone-800 text-stone-400' : 'bg-stone-50 border-stone-200 text-stone-600'}`}>
                فایل PDF برای این اثر هنوز بارگذاری نشده است.
              </div>
            )}
          </div>

          <div className={`p-6 rounded-3xl border ${darkMode ? 'bg-stone-900/40 border-stone-800' : 'bg-white border-stone-200 shadow-sm'}`}>
            <h3 className="text-xl font-bold mb-6 border-r-4 brand-border pr-3 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 brand-text" />
              دیدگاه‌های کاربران
            </h3>
            <form onSubmit={handleSubmitComment} className="flex gap-3 mb-6">
              <input
                type="text"
                placeholder={currentUser ? "نظر خود را بنویسید..." : "برای ثبت نظر، ابتدا وارد شوید..."}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                disabled={!currentUser}
                onFocus={() => { if (!currentUser) openAuth('login'); }}
                className={`flex-1 py-3 px-4 rounded-xl border outline-none text-sm disabled:opacity-60 ${darkMode ? 'bg-stone-950 border-stone-800 text-white focus:border-rose-600' : 'bg-stone-50 border-stone-300 focus:border-rose-600'}`}
              />
              <button
                type="submit"
                disabled={commentSubmitting}
                className="brand-bg text-white px-5 rounded-xl hover:opacity-90 transition flex items-center gap-2 font-semibold disabled:opacity-70"
              >
                <span>ارسال</span>
                {commentSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>

            {commentError && (
              <div className="flex items-center gap-2 text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg mb-6">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{commentError}</span>
              </div>
            )}

            {commentsLoading ? (
              <div className="flex items-center gap-2 text-stone-500 text-sm py-6 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>در حال دریافت نظرات...</span>
              </div>
            ) : comments.length === 0 ? (
              <div className="text-center text-stone-500 text-sm py-6">هنوز نظری ثبت نشده — اولین نفر باشید!</div>
            ) : (
              <div className="space-y-4">
                {comments.map((c) => (
                  <div key={c.id} className={`p-4 rounded-2xl border ${darkMode ? 'bg-stone-950/50 border-stone-800' : 'bg-stone-50 border-stone-200'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm brand-text">{c.author}</span>
                      <span className="text-[10px] text-stone-500">{formatCommentDate(c.createdAt)}</span>
                    </div>
                    <p className={`text-sm leading-relaxed ${darkMode ? 'text-stone-300' : 'text-stone-700'}`}>{c.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      ) : activeCategory ? (

        <main className="max-w-6xl mx-auto p-4 md:p-8">
          <button
            onClick={goHome}
            className="flex items-center gap-2 text-sm brand-text font-bold mb-6 hover:underline"
          >
            <ArrowLeft className="w-4 h-4 rotate-180" />
            بازگشت به صفحه اصلی
          </button>

          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-black mb-2 border-r-4 brand-border pr-4">
                {activeCategory === 'books' ? 'آرشیو کامل کتاب‌ها و رمان‌ها' : 'آرشیو کامل مقاله‌ها و یادداشت‌ها'}
              </h1>
              <p className={`text-sm ${darkMode ? 'text-stone-400' : 'text-stone-600'}`}>
                {activeCategory === 'books' ? 'نمایش تمام عناوین کتاب‌ها و رمان‌های منتشرشده' : 'نمایش تمام مقالات علمی، پژوهشی و تحلیلی'}
              </p>
            </div>

            <div className={`px-3 py-2 rounded-xl border flex items-center gap-2 text-sm ${darkMode ? 'bg-stone-900 border-stone-800 text-stone-300' : 'bg-white border-stone-200'}`}>
              <Filter className="w-4 h-4 brand-text shrink-0" />
              <select
                value={archiveSort}
                onChange={(e) => setArchiveSort(e.target.value)}
                className={`bg-transparent outline-none text-sm ${darkMode ? 'text-stone-200' : 'text-stone-700'}`}
              >
                <option value="newest" className={darkMode ? 'bg-stone-900' : ''}>جدیدترین</option>
                <option value="oldest" className={darkMode ? 'bg-stone-900' : ''}>قدیمی‌ترین</option>
                <option value="rating" className={darkMode ? 'bg-stone-900' : ''}>بیشترین امتیاز</option>
              </select>
            </div>
          </div>

          {itemsLoading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-stone-500 text-sm">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>در حال دریافت آثار...</span>
            </div>
          ) : itemsError ? (
            <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/10 px-4 py-3 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{itemsError}</span>
            </div>
          ) : allItems.filter(item => item.category === activeCategory).length === 0 ? (
            <div className="text-center py-20 text-stone-500 text-sm">هنوز اثری در این دسته منتشر نشده است.</div>
          ) : (
          <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {sortItems(allItems.filter(item => item.category === activeCategory), archiveSort)
              .slice(0, listLimit)
              .map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedBook(item)}
                  className={`spine-card rounded-3xl p-5 border cursor-pointer transition duration-300 hover:-translate-y-1 hover:shadow-xl ${darkMode ? 'bg-stone-900/80 border-stone-800 hover:border-rose-700' : 'bg-white border-stone-200 hover:border-rose-400'}`}
                >
                  <div className={`h-48 rounded-2xl bg-gradient-to-tr ${item.coverBg} mb-5 flex items-center justify-center text-white font-bold text-lg shadow-inner`}>
                    کاور اثر
                  </div>

                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-bold text-lg">{item.title}</h3>
                      <span className={`inline-block mt-1 text-[11px] font-bold px-2 py-0.5 rounded-lg ${item.price > 0 ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                        {item.price > 0 ? formatToman(item.price) : 'رایگان'}
                      </span>
                    </div>
                    <span className="flex items-center gap-1 text-sm text-amber-500 font-bold bg-amber-500/10 px-2 py-0.5 rounded-lg">
                      <Star className="w-4 h-4 fill-amber-500" /> {item.ratingCount > 0 ? item.rating.toFixed(1) : '—'}
                    </span>
                  </div>

                  <p className={`text-sm mb-6 ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>
                    نویسنده:{' '}
                    <button
                      onClick={(e) => { e.stopPropagation(); openAuthorProfile(item.ownerId); }}
                      disabled={!item.ownerId}
                      className="hover:underline disabled:no-underline disabled:cursor-default"
                    >
                      {item.author}
                    </button>
                  </p>

                  <div className="flex justify-between items-center pt-4 border-t border-stone-800/50">
                    <span className="text-xs px-3 py-1 rounded-full bg-rose-600/10 brand-text font-medium border border-rose-600/20">
                      {item.type}
                    </span>
                    <button className="text-sm font-semibold brand-text hover:opacity-80 transition">
                      مشاهده و مطالعه
                    </button>
                  </div>
                </div>
              ))}
          </div>
          {renderShowMore(allItems.filter(item => item.category === activeCategory).length)}
          </>
          )}
        </main>
      ) : searchResults !== null ? (

        /* نتایج جستجو */
        <main className="max-w-6xl mx-auto p-4 md:p-8">
          <button
            onClick={goHome}
            className="flex items-center gap-2 text-sm brand-text font-bold mb-6 hover:underline"
          >
            <ArrowLeft className="w-4 h-4 rotate-180" />
            بازگشت به صفحه اصلی
          </button>

          <h1 className="text-2xl md:text-3xl font-black mb-8 border-r-4 brand-border pr-4">
            نتایج جستجو برای «{searchQuery}»
          </h1>

          {searchLoading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-stone-500 text-sm">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>در حال جستجو...</span>
            </div>
          ) : searchError ? (
            <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/10 px-4 py-3 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{searchError}</span>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="text-center py-20 text-stone-500 text-sm">چیزی مطابق جستجوی شما پیدا نشد.</div>
          ) : (
            <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {searchResults.slice(0, listLimit).map((item) => (
                <div
                  key={item.id}
                  onClick={() => { setSelectedBook(item); setSearchResults(null); }}
                  className={`spine-card rounded-3xl p-5 border cursor-pointer transition duration-300 hover:-translate-y-1 hover:shadow-xl ${darkMode ? 'bg-stone-900/80 border-stone-800 hover:border-rose-700' : 'bg-white border-stone-200 hover:border-rose-400'}`}
                >
                  <div className={`h-48 rounded-2xl bg-gradient-to-tr ${item.coverBg} mb-5 flex items-center justify-center text-white font-bold text-lg shadow-inner`}>
                    کاور اثر
                  </div>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-bold text-lg">{item.title}</h3>
                      <span className={`inline-block mt-1 text-[11px] font-bold px-2 py-0.5 rounded-lg ${item.price > 0 ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                        {item.price > 0 ? formatToman(item.price) : 'رایگان'}
                      </span>
                    </div>
                    <span className="flex items-center gap-1 text-sm text-amber-500 font-bold bg-amber-500/10 px-2 py-0.5 rounded-lg">
                      <Star className="w-4 h-4 fill-amber-500" /> {item.ratingCount > 0 ? item.rating.toFixed(1) : '—'}
                    </span>
                  </div>
                  <p className={`text-sm mb-6 ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>
                    نویسنده:{' '}
                    <button
                      onClick={(e) => { e.stopPropagation(); openAuthorProfile(item.ownerId); }}
                      disabled={!item.ownerId}
                      className="hover:underline disabled:no-underline disabled:cursor-default"
                    >
                      {item.author}
                    </button>
                  </p>
                  <div className="flex justify-between items-center pt-4 border-t border-stone-800/50">
                    <span className="text-xs px-3 py-1 rounded-full bg-rose-600/10 brand-text font-medium border border-rose-600/20">
                      {item.type}
                    </span>
                    <button className="text-sm font-semibold brand-text hover:opacity-80 transition">
                      مشاهده و مطالعه
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {renderShowMore(searchResults.length)}
            </>
          )}
        </main>
      ) : (

        <main>
          <section className="min-h-[calc(100vh-88px)] flex flex-col justify-center p-4 md:px-12 text-center max-w-4xl mx-auto">
            <div className="flex justify-center mb-6">
              <Logo size={64} />
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold mb-4 leading-tight">اشتراک‌گذاری رمان‌ها و کتاب‌های صوتی مستقل</h1>
            <p className={`mb-8 text-base md:text-lg ${darkMode ? 'text-stone-400' : 'text-stone-600'}`}>خانه‌ای امن برای ناشران شخصی و عاشقان کتاب — آنکت‌نویس</p>

            <form onSubmit={handleSearchSubmit} className="relative max-w-xl mx-auto mb-10 w-full">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجوی نام کتاب، مقاله، نویسنده..."
                className={`w-full py-4 pr-12 pl-4 rounded-2xl border outline-none text-sm md:text-base shadow-sm transition ${darkMode ? 'bg-stone-900 border-stone-800 text-white focus:border-rose-600' : 'bg-white border-stone-300 focus:border-rose-600'}`}
              />
              <button type="submit" className="absolute right-4 top-4.5">
                <Search className="w-5 h-5 text-stone-400" />
              </button>
            </form>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto text-right w-full">

              <div
                onClick={() => setActiveCategory('books')}
                className={`p-6 rounded-3xl border transition duration-300 hover:-translate-y-1 group cursor-pointer ${darkMode ? 'bg-gradient-to-br from-rose-950/40 to-stone-900 border-rose-900/50 hover:border-rose-600' : 'bg-white border-rose-100 shadow-md hover:border-rose-400'}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-rose-600/15 brand-text flex items-center justify-center">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <ArrowLeft className="w-5 h-5 text-stone-400 group-hover:-translate-x-1 transition" />
                </div>
                <h3 className="text-xl font-bold mb-2">کتاب‌ها و رمان‌ها</h3>
                <p className={`text-sm ${darkMode ? 'text-stone-400' : 'text-stone-600'}`}>مشاهده لیست کامل داستان‌ها و رمان‌ها با قابلیت پخش آنلاین و مطالعه امن.</p>
              </div>

              <div
                onClick={() => setActiveCategory('articles')}
                className={`p-6 rounded-3xl border transition duration-300 hover:-translate-y-1 group cursor-pointer ${darkMode ? 'bg-gradient-to-br from-stone-800/60 to-stone-900 border-stone-700/50 hover:border-stone-500' : 'bg-white border-stone-200 shadow-md hover:border-stone-400'}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-stone-600/15 text-stone-400 flex items-center justify-center">
                    <FileText className="w-6 h-6" />
                  </div>
                  <ArrowLeft className="w-5 h-5 text-stone-400 group-hover:-translate-x-1 transition" />
                </div>
                <h3 className="text-xl font-bold mb-2">مقاله‌ها و یادداشت‌ها</h3>
                <p className={`text-sm ${darkMode ? 'text-stone-400' : 'text-stone-600'}`}>مشاهده لیست کامل مقالات تحلیلی، پژوهش‌ها و یادداشت‌های تخصصی.</p>
              </div>

            </div>
          </section>

          <section className="p-4 md:p-12 border-t border-stone-800/40">
            <div className="max-w-5xl mx-auto w-full">
              <h2 className="text-3xl font-extrabold mb-8 border-r-4 brand-border pr-4">جدیدترین آثار منتشرشده</h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {allItems.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedBook(item)}
                    className={`spine-card rounded-3xl p-5 border cursor-pointer transition duration-300 hover:-translate-y-1 hover:shadow-xl ${darkMode ? 'bg-stone-900/80 border-stone-800 hover:border-rose-700' : 'bg-white border-stone-200 hover:border-rose-400'}`}
                  >
                    <div className={`h-48 rounded-2xl bg-gradient-to-tr ${item.coverBg} mb-5 flex items-center justify-center text-white font-bold text-lg shadow-inner`}>
                      کاور اثر
                    </div>

                    <div className="flex justify-between items-start mb-2">
                      <div>
                      <h3 className="font-bold text-lg">{item.title}</h3>
                      <span className={`inline-block mt-1 text-[11px] font-bold px-2 py-0.5 rounded-lg ${item.price > 0 ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                        {item.price > 0 ? formatToman(item.price) : 'رایگان'}
                      </span>
                    </div>
                      <span className="flex items-center gap-1 text-sm text-amber-500 font-bold bg-amber-500/10 px-2 py-0.5 rounded-lg">
                        <Star className="w-4 h-4 fill-amber-500" /> {item.ratingCount > 0 ? item.rating.toFixed(1) : '—'}
                      </span>
                    </div>

                    <p className={`text-sm mb-6 ${darkMode ? 'text-stone-400' : 'text-stone-500'}`}>
                    نویسنده:{' '}
                    <button
                      onClick={(e) => { e.stopPropagation(); openAuthorProfile(item.ownerId); }}
                      disabled={!item.ownerId}
                      className="hover:underline disabled:no-underline disabled:cursor-default"
                    >
                      {item.author}
                    </button>
                  </p>

                    <div className="flex justify-between items-center pt-4 border-t border-stone-800/50">
                      <span className="text-xs px-3 py-1 rounded-full bg-rose-600/10 brand-text font-medium border border-rose-600/20">
                        {item.type}
                      </span>
                      <button className="text-sm font-semibold brand-text hover:opacity-80 transition">
                        مشاهده جزئیات
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="p-4 md:p-12 border-t border-stone-800/40">
            <div className="max-w-5xl mx-auto w-full my-8">
              <div className="text-center mb-12">
                <MessageSquareQuote className="w-12 h-12 brand-text mx-auto mb-3 opacity-80" />
                <h2 className="text-3xl font-extrabold mb-3">دیدگاه مخاطبان و نویسندگان</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {testimonials.map((t) => (
                  <div key={t.id} className={`p-6 rounded-3xl border flex flex-col justify-between ${darkMode ? 'bg-stone-900/50 border-stone-800' : 'bg-white border-stone-200 shadow-sm'}`}>
                    <p className={`text-sm leading-relaxed mb-6 ${darkMode ? 'text-stone-300' : 'text-stone-600'}`}>"{t.text}"</p>
                    <div className="pt-4 border-t border-stone-800/30">
                      <h4 className="font-bold text-sm">{t.name}</h4>
                      <span className="text-xs brand-text">{t.role}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <footer className={`mt-16 py-6 text-center text-xs border-t ${darkMode ? 'border-stone-900 text-stone-500' : 'border-stone-200 text-stone-400'}`}>
              تمامی حقوق برای پلتفرم «آنکت‌نویس» محفوظ است © ۱۴۰۵
            </footer>
          </section>
        </main>
      ))}

      {/* پاپ‌آپ ورود / ثبت‌نام */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="ورود یا ثبت‌نام">
          <div className={`w-full max-w-md p-6 rounded-3xl border shadow-2xl relative ${darkMode ? 'bg-stone-900 border-stone-800 text-white' : 'bg-white border-stone-200 text-stone-800'}`}>

            <button
              onClick={() => setShowAuthModal(false)}
              aria-label="بستن"
              className="absolute top-5 left-5 p-2 rounded-xl text-stone-400 hover:text-white hover:bg-stone-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex justify-center mb-4">
              <Logo size={40} />
            </div>

            <div className="text-center mb-6">
              <h3 className="text-2xl font-black mb-1">
                {authMode === 'login' && authStep === 'otp'
                  ? 'کد تأیید رو وارد کنید'
                  : authMode === 'login' && authStep === 'forgot'
                    ? 'بازیابی رمز عبور'
                    : authMode === 'login' && authStep === 'reset'
                      ? 'تعیین رمز عبور جدید'
                      : authMode === 'login' ? 'ورود به حساب کاربری' : 'ایجاد حساب کاربری'}
              </h3>
              <p className="text-xs text-stone-400">
                {authMode === 'login' && authStep === 'otp'
                  ? otpMessage
                  : authMode === 'login' && authStep === 'forgot'
                    ? 'ایمیل حساب خود را وارد کنید تا کد بازیابی برایتان ارسال شود'
                    : authMode === 'login' && authStep === 'reset'
                      ? otpMessage
                      : authMode === 'login' ? 'برای دسترسی به کتاب‌ها و پنل وارد شوید' : 'به جامعه نویسندگان و خوانندگان آنکت‌نویس بپیوندید'}
              </p>
            </div>

            {authMode === 'login' && authStep === 'otp' ? (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">کد شش‌رقمی</label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="------"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className={`w-full py-3 pr-10 pl-3 rounded-xl border outline-none text-center tracking-[0.5em] text-lg font-bold ${darkMode ? 'bg-stone-950 border-stone-800 focus:border-rose-600' : 'bg-stone-50 border-stone-300'}`}
                      required
                      autoFocus
                    />
                    <KeyRound className="w-4 h-4 absolute right-3.5 top-3.5 text-stone-400" />
                  </div>
                </div>

                {authError && (
                  <div className="flex items-center gap-2 text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{authError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-3 brand-bg text-white rounded-xl font-bold hover:opacity-90 transition mt-2 flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {authLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  تأیید و ورود
                </button>

                <div className="flex items-center justify-between text-xs pt-2">
                  <button type="button" onClick={() => setAuthStep('credentials')} className="text-stone-400 hover:underline">
                    بازگشت
                  </button>
                  <button type="button" onClick={handleResendOtp} disabled={otpResending} className="brand-text font-bold hover:underline disabled:opacity-60">
                    {otpResending ? 'در حال ارسال...' : 'ارسال دوباره‌ی کد'}
                  </button>
                </div>
              </form>
            ) : authMode === 'login' && authStep === 'forgot' ? (
              <form onSubmit={handleForgot} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">ایمیل حساب</label>
                  <div className="relative">
                    <input
                      type="email"
                      placeholder="example@gmail.com"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      className={`${inputCls} pr-10`}
                      required
                      autoFocus
                    />
                    <Mail className="w-4 h-4 absolute right-3.5 top-3.5 text-stone-400" />
                  </div>
                </div>

                {authError && (
                  <div className="flex items-center gap-2 text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{authError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-3 brand-bg text-white rounded-xl font-bold hover:opacity-90 transition mt-2 flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {authLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  ارسال کد بازیابی
                </button>

                <div className="text-xs pt-2">
                  <button type="button" onClick={() => { setAuthError(""); setAuthStep('credentials'); }} className="text-stone-400 hover:underline">
                    بازگشت به ورود
                  </button>
                </div>
              </form>
            ) : authMode === 'login' && authStep === 'reset' ? (
              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">کد شش‌رقمی بازیابی</label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="------"
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className={`${inputCls} pr-10 text-center tracking-[0.5em] text-lg font-bold`}
                      required
                      autoFocus
                    />
                    <KeyRound className="w-4 h-4 absolute right-3.5 top-3.5 text-stone-400" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">رمز عبور جدید</label>
                  <div className="relative">
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      minLength={8}
                      className={`${inputCls} pr-10`}
                      required
                    />
                    <Lock className="w-4 h-4 absolute right-3.5 top-3.5 text-stone-400" />
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1">حداقل ۸ کاراکتر</p>
                </div>

                {authError && (
                  <div className="flex items-center gap-2 text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{authError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-3 brand-bg text-white rounded-xl font-bold hover:opacity-90 transition mt-2 flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {authLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  تغییر رمز عبور
                </button>

                <div className="flex items-center justify-between text-xs pt-2">
                  <button type="button" onClick={() => { setAuthError(""); setAuthStep('forgot'); }} className="text-stone-400 hover:underline">
                    تغییر ایمیل
                  </button>
                  <button type="button" onClick={handleResendReset} disabled={otpResending} className="brand-text font-bold hover:underline disabled:opacity-60">
                    {otpResending ? 'در حال ارسال...' : 'ارسال دوباره‌ی کد'}
                  </button>
                </div>
              </form>
            ) : (
            <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} className="space-y-4">
              {authMode === 'register' && (
                <div>
                  <label className="block text-xs font-semibold mb-1">نام و نام خانوادگی</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="علی رضایی"
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      className={`w-full py-3 pr-10 pl-3 rounded-xl border outline-none text-sm ${darkMode ? 'bg-stone-950 border-stone-800 focus:border-rose-600' : 'bg-stone-50 border-stone-300'}`}
                      required
                    />
                    <User className="w-4 h-4 absolute right-3.5 top-3.5 text-stone-400" />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold mb-1">ایمیل</label>
                <div className="relative">
                  <input
                    type="email"
                    placeholder="example@gmail.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className={`w-full py-3 pr-10 pl-3 rounded-xl border outline-none text-sm ${darkMode ? 'bg-stone-950 border-stone-800 focus:border-rose-600' : 'bg-stone-50 border-stone-300'}`}
                    required
                  />
                  <Mail className="w-4 h-4 absolute right-3.5 top-3.5 text-stone-400" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">رمز عبور</label>
                <div className="relative">
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    minLength={8}
                    className={`w-full py-3 pr-10 pl-3 rounded-xl border outline-none text-sm ${darkMode ? 'bg-stone-950 border-stone-800 focus:border-rose-600' : 'bg-stone-50 border-stone-300'}`}
                    required
                  />
                  <Lock className="w-4 h-4 absolute right-3.5 top-3.5 text-stone-400" />
                </div>
                {authMode === 'register' && (
                  <p className="text-[11px] text-stone-500 mt-1 leading-5">
                    حداقل ۸ کاراکتر. حساب جدید به‌عنوان «خواننده» ساخته می‌شود؛ نویسنده شدن فقط با تأیید مدیریت سایت ممکن است.
                  </p>
                )}
              </div>

              {authMode === 'login' && (
                <div className="-mt-2">
                  <button type="button" onClick={goForgot} className="text-xs brand-text font-bold hover:underline">
                    رمز عبورم را فراموش کرده‌ام
                  </button>
                </div>
              )}

              {authNotice && authMode === 'login' && (
                <div className="flex items-center gap-2 text-xs text-emerald-500 bg-emerald-500/10 px-3 py-2 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{authNotice}</span>
                </div>
              )}

              {authError && (
                <div className="flex items-center gap-2 text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 brand-bg text-white rounded-xl font-bold hover:opacity-90 transition mt-2 flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {authLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {authMode === 'login' ? 'ورود' : 'ثبت‌نام'}
              </button>
            </form>
            )}

            {!(authMode === 'login' && authStep !== 'credentials') && (
              <div className="text-center mt-6 pt-4 border-t border-stone-800 text-xs">
                {authMode === 'login' ? (
                  <p className="text-stone-400">
                    حساب کاربری ندارید؟ {' '}
                    <button onClick={() => { setAuthMode('register'); setAuthError(""); }} className="brand-text font-bold hover:underline">
                      ثبت‌نام کنید
                    </button>
                  </p>
                ) : (
                  <p className="text-stone-400">
                    قبلاً ثبت‌نام کرده‌اید؟ {' '}
                    <button onClick={() => { setAuthMode('login'); setAuthError(""); }} className="brand-text font-bold hover:underline">
                      وارد شوید
                    </button>
                  </p>
                )}
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
