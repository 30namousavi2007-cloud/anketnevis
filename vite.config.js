import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// در بیلد production یک سیاست امنیتی محتوا (CSP) به index.html اضافه می‌شود؛
// فقط اسکریپت‌های خود سایت اجرا می‌شوند و فقط به بک‌اند خودتان درخواست زده می‌شود.
function cspPlugin(apiOrigin) {
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
        `media-src 'self' ${apiOrigin}`,
        `frame-src ${apiOrigin}`,
        `connect-src 'self' ${apiOrigin}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
      return html.replace('</title>', `</title>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiOrigin = (env.VITE_API_URL || '').replace(/\/+$/, '')
  if (mode === 'production' && !apiOrigin) {
    throw new Error('VITE_API_URL تنظیم نشده است. آدرس بک‌اند را قبل از بیلد بگذارید (مثلاً VITE_API_URL=https://api.example.ir).')
  }
  return {
    plugins: [react(), cspPlugin(apiOrigin || 'http://localhost:4000')],
  }
})
