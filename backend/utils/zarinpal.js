// اتصال به درگاه زرین‌پال (API نسخه‌ی ۴، JSON).
// مبلغ‌ها در دیتابیس «تومان» هستند؛ زرین‌پال به‌صورت پیش‌فرض «ریال» می‌گیرد، پس اینجا ×۱۰ می‌شود.
//
// متغیرهای .env:
//   ZARINPAL_MERCHANT_ID  کد ۳۶ کاراکتری پذیرنده (در حالت آزمایشی هر UUID معتبر است)
//   ZARINPAL_SANDBOX      true (پیش‌فرض) = درگاه آزمایشی، false = درگاه واقعی
//   BACKEND_URL           آدرس عمومی همین بک‌اند، برای ساخت آدرس بازگشت از درگاه

const SANDBOX_PLACEHOLDER_MERCHANT = '00000000-0000-0000-0000-000000000000';

function isSandbox() {
  return String(process.env.ZARINPAL_SANDBOX ?? 'true').toLowerCase() !== 'false';
}

function apiBase() {
  return isSandbox() ? 'https://sandbox.zarinpal.com' : 'https://payment.zarinpal.com';
}

function merchantId() {
  const id = (process.env.ZARINPAL_MERCHANT_ID || '').trim();
  if (id) return id;
  if (isSandbox()) return SANDBOX_PLACEHOLDER_MERCHANT;
  throw new Error('ZARINPAL_MERCHANT_ID در فایل .env تنظیم نشده است.');
}

async function postJson(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'ZarinPal Rest Api v4',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return await res.json().catch(() => null);
  } finally {
    clearTimeout(timer);
  }
}

function errorMessage(json, fallback) {
  const code = json?.errors?.code ?? json?.data?.code;
  const message = json?.errors?.message || json?.data?.message;
  return `${fallback}${code != null ? ` (کد ${code})` : ''}${message ? `: ${message}` : ''}`;
}

// درخواست پرداخت → { authority, url }
async function requestPayment({ amountToman, callbackUrl, description, email }) {
  const json = await postJson('/pg/v4/payment/request.json', {
    merchant_id: merchantId(),
    amount: amountToman * 10,
    callback_url: callbackUrl,
    description,
    ...(email ? { metadata: { email } } : {}),
  });
  if (json?.data?.code !== 100 || !json.data.authority) {
    throw new Error(errorMessage(json, 'درگاه پرداخت درخواست را نپذیرفت'));
  }
  return {
    authority: json.data.authority,
    url: `${apiBase()}/pg/StartPay/${json.data.authority}`,
  };
}

// تأیید پرداخت. کد ۱۰۰ = تأیید شد، ۱۰۱ = قبلاً تأیید شده بود.
async function verifyPayment({ amountToman, authority }) {
  const json = await postJson('/pg/v4/payment/verify.json', {
    merchant_id: merchantId(),
    amount: amountToman * 10,
    authority,
  });
  const code = json?.data?.code;
  return {
    ok: code === 100 || code === 101,
    code,
    refId: json?.data?.ref_id != null ? String(json.data.ref_id) : null,
    raw: json,
  };
}

module.exports = { requestPayment, verifyPayment, isSandbox };
