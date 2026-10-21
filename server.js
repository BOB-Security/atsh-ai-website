'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const helmet = require('helmet');
const Database = require('better-sqlite3');

const app = express();
const port = Number(process.env.PORT || 3000);
const dataPath = path.resolve(process.env.DATABASE_PATH || './data/atsh-ai.sqlite');
fs.mkdirSync(path.dirname(dataPath), { recursive: true });
const db = new Database(dataPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(
  "CREATE TABLE IF NOT EXISTS submissions (" +
  "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
  "type TEXT NOT NULL CHECK(type IN ('contact', 'referral')), " +
  "name TEXT NOT NULL, email TEXT NOT NULL, organization TEXT, subject TEXT, message TEXT NOT NULL, " +
  "created_at TEXT NOT NULL DEFAULT (datetime('now')), " +
  "status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'reviewing', 'approved', 'rejected', 'closed'))" +
  "); CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions(created_at DESC);"
);

app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '16kb', strict: true }));

// Keep repository internals out of the public static-file server.
app.use((req, res, next) => {
  let pathname;
  try {
    pathname = decodeURIComponent(req.path);
  } catch {
    return res.sendStatus(400);
  }
  if (
    /^\/(?:server\.js|package\.json|package-lock\.json|\.env(?:\..*)?|README\.md)$/i.test(pathname) ||
    /^\/(?:docs|test|\.git|\.github|node_modules|data)(?:\/|$)/i.test(pathname)
  ) {
    return res.sendStatus(404);
  }
  next();
});
app.use(express.static(path.join(__dirname), { extensions: ['html'], dotfiles: 'deny', index: 'index.html' }));

const rateBuckets = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || 'unknown';
  const windowMs = 10 * 60 * 1000;
  const current = rateBuckets.get(key);
  if (!current || now - current.start > windowMs) {
    rateBuckets.set(key, { start: now, count: 1 });
  } else if (++current.count > 12) {
    return res.status(429).json({ error: 'محاولات كثيرة. حاول مرة أخرى بعد قليل.' });
  }
  if (rateBuckets.size > 5000) {
    for (const [ip, bucket] of rateBuckets) {
      if (now - bucket.start > windowMs) rateBuckets.delete(ip);
    }
  }
  next();
}

const insertSubmission = db.prepare(
  'INSERT INTO submissions (type, name, email, organization, subject, message) VALUES (@type, @name, @email, @organization, @subject, @message)'
);
const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
function validate(body, type) {
  const data = {
    type,
    name: clean(body.name, 120),
    email: clean(body.email, 254).toLowerCase(),
    organization: clean(body.organization, 160),
    subject: clean(body.subject, 160),
    message: clean(body.message, 4000)
  };
  if (body.website) return { spam: true };
  if (data.name.length < 2) return { error: 'يرجى إدخال الاسم بشكل صحيح.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return { error: 'يرجى إدخال بريد إلكتروني صحيح.' };
  if (data.message.length < 10) return { error: 'يرجى كتابة تفاصيل أكثر (10 أحرف على الأقل).' };
  if (type === 'referral' && !data.organization) return { error: 'يرجى إدخال اسم الشركة أو الجهة.' };
  return { data };
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'atsh-ai-inquiry-api' });
});

function submit(type) {
  return (req, res) => {
    const result = validate(req.body || {}, type);
    if (result.spam) return res.status(202).json({ ok: true, message: 'تم استلام طلبك.' });
    if (result.error) return res.status(400).json({ error: result.error });
    try {
      const info = insertSubmission.run(result.data);
      return res.status(201).json({
        ok: true,
        reference: 'ATS-' + String(info.lastInsertRowid).padStart(6, '0'),
        message: 'تم استلام طلبك وحفظه للمراجعة الإدارية. لا يُعد ذلك موافقة أو تعيينًا أو التزامًا تجاريًا.'
      });
    } catch (error) {
      console.error('Submission persistence failed:', error.message);
      return res.status(500).json({ error: 'تعذر حفظ الطلب الآن. حاول لاحقًا.' });
    }
  };
}
app.post('/api/contact', rateLimit, submit('contact'));
app.post('/api/referrals', rateLimit, submit('referral'));

const allowedStatuses = new Set(['new', 'reviewing', 'approved', 'rejected', 'closed']);
const listSubmissions = db.prepare(
  'SELECT id, type, name, email, organization, subject, message, created_at, status FROM submissions ORDER BY created_at DESC, id DESC LIMIT ?'
);
const filterSubmissions = db.prepare(
  'SELECT id, type, name, email, organization, subject, message, created_at, status FROM submissions WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT ?'
);
const updateSubmissionStatus = db.prepare('UPDATE submissions SET status = ? WHERE id = ?');

function requireAdmin(req, res, next) {
  res.set('Cache-Control', 'no-store');
  const configured = process.env.ADMIN_API_TOKEN || '';
  if (configured.length < 32) {
    return res.status(503).json({ error: 'لوحة الإدارة غير مفعّلة. يلزم ضبط ADMIN_API_TOKEN آمن على الخادم.' });
  }
  const match = /^Bearer (.+)$/i.exec(req.get('authorization') || '');
  if (!match) return res.status(401).json({ error: 'يلزم تسجيل الدخول برمز الإدارة.' });
  const supplied = Buffer.from(match[1]);
  const expected = Buffer.from(configured);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return res.status(401).json({ error: 'رمز الإدارة غير صحيح.' });
  }
  next();
}

app.get('/api/admin/submissions', requireAdmin, (req, res) => {
  const status = clean(req.query.status, 20);
  if (status && !allowedStatuses.has(status)) {
    return res.status(400).json({ error: 'حالة الطلب غير صحيحة.' });
  }
  const rows = status ? filterSubmissions.all(status, 100) : listSubmissions.all(100);
  return res.json({ submissions: rows, limit: 100 });
});

app.patch('/api/admin/submissions/:id/status', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const status = clean((req.body || {}).status, 20);
  if (!Number.isSafeInteger(id) || id < 1 || !allowedStatuses.has(status)) {
    return res.status(400).json({ error: 'رقم الطلب أو الحالة غير صحيحين.' });
  }
  const result = updateSubmissionStatus.run(status, id);
  if (result.changes === 0) return res.status(404).json({ error: 'لم يتم العثور على الطلب.' });
  return res.json({ ok: true, id, status });
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'المسار غير موجود.' }));
app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'صيغة البيانات المرسلة غير صحيحة.' });
  console.error('Unhandled request error:', error.message);
  return res.status(500).json({ error: 'حدث خطأ غير متوقع.' });
});

app.listen(port, () => console.log('atsh-ai server listening on port ' + port));
