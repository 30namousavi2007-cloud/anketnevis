import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// در بیلد production یک سیاست امنیتی محتوا (CSP) به index.html اضافه می‌شود؛
// فقط اسکریپت‌های خود سایت اجرا می‌شوند و فقط به بک‌اند خودتان درخواست زده می‌شود.
function cspPlugin({ apiSrc, filesSrc }) {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const csp = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob:",
        `media-src 'self' ${filesSrc} ${apiSrc}`,
        `frame-src ${filesSrc} ${apiSrc}`,
        `connect-src 'self' ${apiSrc}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
      return html.replace('</title>', `</title>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`)
    },
  }
}

// آدرس را به «مبدأ» (https://host) تبدیل می‌کند؛ مبدأ CSP نباید مسیر مثل /api داشته باشد
function toOrigin(value, name) {
  try {
    return new URL(value).origin
  } catch (_) {
    throw new Error(`${name} آدرس معتبری نیست (مثلاً https://anketnevis.onrender.com).`)
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const rawApi = env.VITE_API_URL
  if (mode === 'production' && rawApi === undefined) {
    throw new Error('VITE_API_URL تنظیم نشده است. آدرس بک‌اند (مثلاً https://anketnevis.onrender.com) یا «/» برای حالت Rewrite را قبل از بیلد بگذارید.')
  }
  // «/» یا خالی = API هم‌مبدأ با سایت (Static Site با Rewrite)
  const sameOrigin = rawApi !== undefined && (rawApi.trim() === '' || rawApi.trim().startsWith('/'))
  const apiSrc = sameOrigin ? "'self'" : rawApi ? toOrigin(rawApi, 'VITE_API_URL') : 'http://localhost:4000'
  const filesSrc = env.VITE_FILES_URL ? toOrigin(env.VITE_FILES_URL, 'VITE_FILES_URL') : apiSrc
  return {
    plugins: [react(), cspPlugin({ apiSrc, filesSrc })],
  }
})
