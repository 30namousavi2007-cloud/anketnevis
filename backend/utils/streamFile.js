// پخش فایل با پشتیبانی کامل از Range (برای PDF و صوت) و مدیریت خطا
const fs = require('fs');

function streamFile(req, res, filePath, { contentType, disposition }) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (_) {
    return res.status(404).json({ error: 'فایل پیدا نشد.' });
  }
  const size = stat.size;

  res.setHeader('Content-Type', contentType);
  if (disposition) res.setHeader('Content-Disposition', disposition);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, no-store');

  if (size === 0) {
    res.setHeader('Content-Length', 0);
    return res.status(200).end();
  }

  let start = 0;
  let end = size - 1;
  let status = 200;

  const match = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || '').trim());
  if (match && (match[1] !== '' || match[2] !== '')) {
    if (match[1] === '') {
      const suffix = parseInt(match[2], 10); // «آخرین N بایت»
      start = Math.max(0, size - suffix);
    } else {
      start = parseInt(match[1], 10);
      if (match[2] !== '') end = Math.min(parseInt(match[2], 10), size - 1);
    }
    if (!(start >= 0) || start >= size || start > end) {
      res.setHeader('Content-Range', `bytes */${size}`);
      return res.status(416).end();
    }
    status = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  }

  res.status(status);
  res.setHeader('Content-Length', end - start + 1);

  const stream = fs.createReadStream(filePath, { start, end });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

module.exports = streamFile;
