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

db.exec(
  "CREATE TABLE IF NOT EXISTS cms_pages (" +
  "id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, " +
  "status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')), " +
  "current_revision_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')), " +
  "updated_at TEXT NOT NULL DEFAULT (datetime('now'))" +
  "); CREATE TABLE IF NOT EXISTS cms_revisions (" +
  "id INTEGER PRIMARY KEY AUTOINCREMENT, page_id INTEGER NOT NULL REFERENCES cms_pages(id) ON DELETE CASCADE, " +
  "title TEXT NOT NULL, body TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))" +
  "); CREATE INDEX IF NOT EXISTS idx_cms_revisions_page ON cms_revisions(page_id, id DESC);"
);

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

// CMS draft API — protected by the existing admin gate. This is a first vertical slice,
// not production identity/role management; do not expose it publicly until that work is complete.
const cmsSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const cmsTitle = value => clean(value, 160);
const cmsBody = value => typeof value === 'string' ? value.trim().slice(0, 20000) : '';
const listCmsPages = db.prepare(
  'SELECT p.id, p.slug, p.title, p.status, p.current_revision_id, p.created_at, p.updated_at, ' +
  '(SELECT COUNT(*) FROM cms_revisions r WHERE r.page_id = p.id) AS revision_count ' +
  'FROM cms_pages p ORDER BY p.updated_at DESC, p.id DESC LIMIT 200'
);
const getCmsPage = db.prepare(
  'SELECT p.id, p.slug, p.title, p.status, p.current_revision_id, p.created_at, p.updated_at ' +
  'FROM cms_pages p WHERE p.id = ?'
);
const getCmsRevision = db.prepare(
  'SELECT id, page_id, title, body, created_by, created_at FROM cms_revisions WHERE id = ? AND page_id = ?'
);
const insertCmsPage = db.prepare(
  "INSERT INTO cms_pages (slug, title, status) VALUES (?, ?, 'draft')"
);
const insertCmsRevision = db.prepare(
  'INSERT INTO cms_revisions (page_id, title, body, created_by) VALUES (?, ?, ?, ?)'
);
const pointCmsPageAtRevision = db.prepare(
  "UPDATE cms_pages SET current_revision_id = ?, title = ?, updated_at = datetime('now') WHERE id = ?"
);

app.get('/api/admin/cms/pages', requireAdmin, (_req, res) => {
  return res.json({ pages: listCmsPages.all() });
});

app.post('/api/admin/cms/pages', requireAdmin, (req, res) => {
  const body = req.body || {};
  const slug = clean(body.slug, 80).toLowerCase();
  const title = cmsTitle(body.title);
  const content = cmsBody(body.body);
  const actor = clean(body.actor, 120) || 'admin-token-session';
  if (!cmsSlugPattern.test(slug) || title.length < 2 || content.length > 20000) {
    return res.status(400).json({ error: 'تحقق من الرابط المختصر والعنوان ومحتوى المسودة.' });
  }
  try {
    const result = db.transaction(() => {
      const page = insertCmsPage.run(slug, title);
      const revision = insertCmsRevision.run(page.lastInsertRowid, title, content, actor);
      pointCmsPageAtRevision.run(revision.lastInsertRowid, title, page.lastInsertRowid);
      return { pageId: Number(page.lastInsertRowid), revisionId: Number(revision.lastInsertRowid) };
    })();
    return res.status(201).json({ ok: true, ...result, status: 'draft' });
  } catch (error) {
    if (String(error.code || '').includes('SQLITE_CONSTRAINT')) {
      return res.status(409).json({ error: 'يوجد بالفعل صفحة بهذا الرابط المختصر.' });
    }
    throw error;
  }
});

app.get('/api/admin/cms/pages/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'رقم الصفحة غير صحيح.' });
  const page = getCmsPage.get(id);
  if (!page) return res.status(404).json({ error: 'لم يتم العثور على الصفحة.' });
  const revision = page.current_revision_id ? getCmsRevision.get(page.current_revision_id, id) : null;
  return res.json({ page, revision });
});

app.post('/api/admin/cms/pages/:id/revisions', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const body = req.body || {};
  const title = cmsTitle(body.title);
  const content = cmsBody(body.body);
  const actor = clean(body.actor, 120) || 'admin-token-session';
  if (!Number.isSafeInteger(id) || id < 1 || title.length < 2 || typeof body.body !== 'string' || body.body.length > 20000) {
    return res.status(400).json({ error: 'تحقق من رقم الصفحة والعنوان والمحتوى (حد أقصى 20,000 حرف).' });
  }
  const page = getCmsPage.get(id);
  if (!page) return res.status(404).json({ error: 'لم يتم العثور على الصفحة.' });
  const result = db.transaction(() => {
    const revision = insertCmsRevision.run(id, title, content, actor);
    pointCmsPageAtRevision.run(revision.lastInsertRowid, title, id);
    return Number(revision.lastInsertRowid);
  })();
  return res.status(201).json({ ok: true, pageId: id, revisionId: result, status: page.status });
});

app.get('/api/admin/cms/pages/:id/revisions', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'رقم الصفحة غير صحيح.' });
  if (!getCmsPage.get(id)) return res.status(404).json({ error: 'لم يتم العثور على الصفحة.' });
  const revisions = db.prepare(
    'SELECT id, page_id, title, created_by, created_at FROM cms_revisions WHERE page_id = ? ORDER BY id DESC LIMIT 100'
  ).all(id);
  return res.json({ revisions });
});

// Publishing is intentionally not implemented in this milestone. Draft APIs never publish content.

app.use('/api', (_req, res) => res.status(404).json({ error: 'المسار غير موجود.' }));
app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'صيغة البيانات المرسلة غير صحيحة.' });
  console.error('Unhandled request error:', error.message);
  return res.status(500).json({ error: 'حدث خطأ غير متوقع.' });
});

app.listen(port, () => console.log('atsh-ai server listening on port ' + port));
