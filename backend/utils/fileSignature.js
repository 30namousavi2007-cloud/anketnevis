// بررسی محتوای واقعی فایل (نه فقط نوعی که مرورگر ادعا می‌کند)
const fs = require('fs');

function readHead(filePath, n = 16) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(n);
    const read = fs.readSync(fd, buf, 0, n, 0);
    return buf.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

function detect(buf) {
  const ascii = (a, b) => buf.toString('latin1', a, b);
  if (buf.length >= 5 && ascii(0, 5) === '%PDF-') return 'pdf';
  if (buf.length >= 3 && ascii(0, 3) === 'ID3') return 'mp3';
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3';
  if (buf.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'wav';
  if (buf.length >= 4 && ascii(0, 4) === 'OggS') return 'ogg';
  if (buf.length >= 12 && ascii(4, 8) === 'ftyp') return 'm4a';
  return null;
}

const AUDIO_MIME = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4' };

function isRealPdf(filePath) {
  return detect(readHead(filePath)) === 'pdf';
}

// نوع صوت واقعی (mp3 | wav | ogg | m4a) یا null اگر فایل صوتی معتبر نیست
function audioKind(filePath) {
  const t = detect(readHead(filePath));
  return t && AUDIO_MIME[t] ? t : null;
}

module.exports = { detect, isRealPdf, audioKind, AUDIO_MIME };
