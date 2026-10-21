// رله‌ی ایمیل روی Google Apps Script
// این اسکریپت یک آدرس وب می‌سازد که بک‌اند آنکت‌نویس با توکن مخفی به آن درخواست می‌دهد
// و اسکریپت ایمیل را از حساب جیمیل صاحب اسکریپت می‌فرستد.
// راهنمای نصب: فایل ../RENDER-SETUP.md (بخش «ایمیل بدون Brevo»).

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var token = PropertiesService.getScriptProperties().getProperty('MAIL_TOKEN');

    if (!token || data.token !== token) {
      return reply({ ok: false, error: 'unauthorized' });
    }
    if (!data.to || !data.subject) {
      return reply({ ok: false, error: 'missing to or subject' });
    }

    MailApp.sendEmail({
      to: data.to,
      subject: data.subject,
      body: data.text || '',
      htmlBody: data.html || undefined,
      name: data.name || 'anketnevis',
    });
    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}

function reply(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
