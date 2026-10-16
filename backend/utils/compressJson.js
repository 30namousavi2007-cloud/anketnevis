// فشرده‌سازی gzip برای پاسخ‌های JSON بزرگ (فهرست آثار و ...)
const zlib = require('zlib');

function compressJson(req, res, next) {
  if (!/\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) return next();
  const original = res.json.bind(res);
  res.json = (obj) => {
    const body = Buffer.from(JSON.stringify(obj));
    if (body.length < 1024) return original(obj);
    const gz = zlib.gzipSync(body);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('Content-Length', gz.length);
    return res.end(gz);
  };
  next();
}

module.exports = compressJson;
