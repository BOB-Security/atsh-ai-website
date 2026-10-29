'use strict';
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadConfig } = require('./src/config');
const { checkDatabase, closePool } = require('./src/db');
const { validateInquiry, createProjectInquiry, getPublicCatalog } = require('./src/intake');
const { login, beginMfaSetup, completeMfaSetup, getSession, logout, cookieHeader, clearCookieHeader, readCookie, hasPermission } = require('./src/auth');
const { listCatalog, createCategory, updateCategory, createPlan, updatePlan, createAddon, updateAddon, setCatalogApproval } = require('./src/admin-catalog');
const config = loadConfig();
const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"] } } }));
app.use(compression());
app.use(express.json({ limit: '64kb' }));
app.use('/api/public', rateLimit({ windowMs: 900000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false }));
const adminLoginLimiter = rateLimit({ windowMs: 900000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false });
function sameOrigin(req, res, next) { const origin = req.headers.origin; if (!origin) return next(); try { if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'origin_rejected' }); } catch { return res.status(403).json({ error: 'origin_rejected' }); } return next(); }
async function loadAdminSession(req, res, allowSetup = false) { const token = readCookie(req); if (!token) { res.status(401).json({ error: 'authentication_required' }); return null; } if (token.startsWith('setup.') && !allowSetup) { res.status(403).json({ error: 'mfa_setup_only' }); return null; } try { const session = await getSession(config, token); if (!session) { res.setHeader('Set-Cookie', clearCookieHeader(config.nodeEnv === 'production')); res.status(401).json({ error: 'session_expired' }); return null; } req.adminToken = token; return session; } catch (error) { console.error('Admin session check failed', { code: error && error.code || 'unknown' }); res.status(503).json({ error: 'authentication_unavailable' }); return null; } }
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], etag: true }));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'atsh-ai-platform', version: '2.0.0' }));
app.get('/ready', async (_req, res) => { try { await checkDatabase(config); res.json({ ok: true, database: { connected: true } }); } catch { res.status(503).json({ ok: false, reason: config.databaseUrl ? 'database_unavailable' : 'database_not_configured' }); } });
app.get('/api/public/catalog', async (_req, res) => {
  try { res.json(await getPublicCatalog(config)); }
  catch (error) {
    console.error('Public catalog unavailable', { code: error && error.code || 'unknown' });
    res.status(503).json({ error: error && error.code === 'ORGANIZATION_NOT_CONFIGURED' ? 'organization_not_configured' : 'catalog_unavailable', message: 'كتالوج الخدمات غير متاح مؤقتًا.' });
  }
});
app.post('/api/public/project-inquiries', async (req, res) => {
  let inquiry;
  try { inquiry = validateInquiry(req.body); }
  catch (error) { return res.status(400).json({ error: 'invalid_request', message: error.message }); }
  try {
    const result = await createProjectInquiry(config, inquiry);
    return res.status(201).json({ ok: true, reference: result.reference });
  } catch (error) {
    console.error('Project inquiry was not saved', { code: error && error.code || 'unknown', name: error && error.name || 'Error' });
    return res.status(503).json({
      error: error && error.code === 'ORGANIZATION_NOT_CONFIGURED' ? 'organization_not_configured' : 'intake_unavailable',
      message: 'تعذر حفظ الطلب حاليًا؛ لم يتم تأكيد الحفظ. حاول مرة أخرى لاحقًا.'
    });
  }
});
app.post('/api/admin/login', adminLoginLimiter, sameOrigin, async (req, res) => {
  try {
    const result = await login(config, req.body && req.body.email, req.body && req.body.password, req.body && (req.body.totpCode || req.body.recoveryCode));
    if (!result) return res.status(401).json({ error: 'invalid_credentials', message: 'بيانات الدخول أو رمز التحقق غير صحيح.' });
    if (result.requiresMfaSetup) return res.status(403).json({ error: 'mfa_setup_required', message: 'يجب إعداد المصادقة متعددة العوامل قبل دخول الإدارة.' });
    if (result.requiresMfa) return res.status(401).json({ error: 'mfa_required', message: 'أدخل رمز المصادقة أو رمز استرداد صالحًا.' });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Set-Cookie', cookieHeader(result.token, config.nodeEnv === 'production', result.expiresInSeconds));
    return res.json({ ok: true, user: result.user });
  } catch (error) {
    console.error('Admin login unavailable', { code: error && error.code || 'unknown' });
    return res.status(503).json({ error: error && error.code === 'MFA_MIGRATION_REQUIRED' ? 'mfa_migration_required' : 'login_unavailable', message: error && error.code === 'MFA_MIGRATION_REQUIRED' ? 'يلزم تطبيق ترحيل المصادقة متعدد العوامل في بيئة الاختبار أولًا.' : 'تسجيل الدخول غير متاح مؤقتًا.' });
  }
});
app.post('/api/admin/mfa/setup', adminLoginLimiter, sameOrigin, async (req, res) => {
  try {
    const result = await beginMfaSetup(config, req.body && req.body.email, req.body && req.body.password, req.body && req.body.bootstrapToken);
    if (!result) return res.status(401).json({ error: 'invalid_credentials', message: 'تعذر التحقق من حساب المالك.' });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Set-Cookie', cookieHeader(result.token, config.nodeEnv === 'production', result.expiresInSeconds));
    return res.json({ ok: true, secret: result.secret, otpauthUrl: result.otpauthUrl, user: result.user });
  } catch (error) {
    console.error('MFA setup unavailable', { code: error && error.code || 'unknown' });
    const status = error && error.code === 'MFA_BOOTSTRAP_DENIED' ? 403 : error && error.code === 'MFA_ALREADY_ENABLED' ? 409 : 503;
    return res.status(status).json({ error: error && error.code || 'mfa_setup_unavailable', message: status === 403 ? 'رمز التهيئة غير صحيح أو غير مفعّل.' : status === 409 ? 'المصادقة متعددة العوامل مفعلة بالفعل.' : 'تهيئة المصادقة غير متاحة. تحقق من الترحيل والإعدادات.' });
  }
});
app.post('/api/admin/mfa/confirm', adminLoginLimiter, sameOrigin, async (req, res) => {
  const token = readCookie(req);
  if (!token || !token.startsWith('setup.')) return res.status(401).json({ error: 'mfa_setup_session_required' });
  const session = await loadAdminSession(req, res, true);
  if (!session) return;
  if (!session.roles.includes('Owner')) return res.status(403).json({ error: 'owner_required' });
  try {
    const result = await completeMfaSetup(config, session.id, req.body && req.body.code, token);
    if (!result) return res.status(400).json({ error: 'invalid_totp', message: 'رمز التحقق غير صحيح أو انتهت جلسة الإعداد.' });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Set-Cookie', cookieHeader(result.token, config.nodeEnv === 'production', result.expiresInSeconds));
    return res.json({ ok: true, user: result.user, recoveryCodes: result.recoveryCodes });
  } catch (error) {
    console.error('MFA confirmation failed', { code: error && error.code || 'unknown' });
    return res.status(503).json({ error: 'mfa_confirmation_unavailable', message: 'تعذر إكمال إعداد المصادقة.' });
  }
});
app.get('/api/admin/me', async (req, res) => {
  const session = await loadAdminSession(req, res);
  if (session) res.json({ ok: true, user: session });
});
app.post('/api/admin/logout', sameOrigin, async (req, res) => {
  try { await logout(config, readCookie(req)); } catch (error) { console.error('Logout cleanup failed', { code: error && error.code || 'unknown' }); }
  res.setHeader('Set-Cookie', clearCookieHeader(config.nodeEnv === 'production'));
  res.json({ ok: true });
});
function requestIpHash(req) { return crypto.createHash('sha256').update(String(req.ip || req.socket.remoteAddress || '')).digest('hex'); }
async function requirePermission(req, res, permission) {
  const session = await loadAdminSession(req, res);
  if (!session) return null;
  if (!hasPermission(session, permission)) { res.status(403).json({ error: 'permission_denied' }); return null; }
  return session;
}
function catalogError(res, error) {
  console.error('Catalog operation failed', { code: error && error.code || 'validation_or_unknown' });
  if (error && error.code === 'NOT_FOUND') return res.status(404).json({ error: 'not_found', message: 'العنصر المطلوب غير موجود.' });
  if (error && error.code === '23505') return res.status(409).json({ error: 'duplicate_slug', message: 'هذا المعرّف مستخدم بالفعل.' });
  if (error && error.code === 'ORGANIZATION_NOT_CONFIGURED') return res.status(503).json({ error: 'organization_not_configured' });
  if (error && ['ECONNREFUSED','ETIMEDOUT','ENOTFOUND','42P01','42703','23503'].includes(error.code)) return res.status(503).json({ error: 'catalog_unavailable', message: 'كتالوج الإدارة غير متاح مؤقتًا.' });
  return res.status(400).json({ error: 'invalid_catalog_input', message: error && error.message || 'راجع البيانات المدخلة.' });
}
app.get('/api/admin/catalog', async (req, res) => {
  const session = await requirePermission(req, res, 'catalog.read');
  if (!session) return;
  try { res.json({ ok: true, ...(await listCatalog(config)) }); }
  catch (error) { catalogError(res, error); }
});
app.post('/api/admin/catalog/categories', sameOrigin, async (req, res) => {
  const session = await requirePermission(req, res, 'catalog.write');
  if (!session) return;
  try { const row = await createCategory(config, session, req.body || {}, requestIpHash(req)); res.status(201).json({ ok: true, category: row }); }
  catch (error) { catalogError(res, error); }
});
app.patch('/api/admin/catalog/categories/:id', sameOrigin, async (req, res) => {
  const session = await requirePermission(req, res, 'catalog.write');
  if (!session) return;
  if (req.body && req.body.active === true && !hasPermission(session, 'catalog.publish')) return res.status(403).json({ error: 'publish_permission_required' });
  try { res.json({ ok: true, category: await updateCategory(config, session, req.params.id, req.body || {}, requestIpHash(req)) }); }
  catch (error) { catalogError(res, error); }
});
app.post('/api/admin/catalog/plans', sameOrigin, async (req, res) => {
  const session = await requirePermission(req, res, 'catalog.write');
  if (!session) return;
  if (!hasPermission(session, 'pricing.write')) return res.status(403).json({ error: 'pricing_permission_required' });
  try { res.status(201).json({ ok: true, plan: await createPlan(config, session, req.body || {}, requestIpHash(req)) }); }
  catch (error) { catalogError(res, error); }
});
app.patch('/api/admin/catalog/plans/:id', sameOrigin, async (req, res) => {
  const session = await requirePermission(req, res, 'catalog.write');
  if (!session) return;
  const body = req.body || {};
  if (['setup_amount_minor','monthly_amount_minor','annual_amount_minor','currency'].some(key => Object.prototype.hasOwnProperty.call(body,key)) && !hasPermission(session, 'pricing.write')) return res.status(403).json({ error: 'pricing_permission_required' });
  if (body.active === true && !hasPermission(session, 'catalog.publish')) return res.status(403).json({ error: 'publish_permission_required' });
  try { res.json({ ok: true, plan: await updatePlan(config, session, req.params.id, body, requestIpHash(req)) }); }
  catch (error) { catalogError(res, error); }
});
app.post('/api/admin/catalog/addons', sameOrigin, async (req, res) => {
  const session = await requirePermission(req, res, 'catalog.write');
  if (!session) return;
  if (!hasPermission(session, 'pricing.write')) return res.status(403).json({ error: 'pricing_permission_required' });
  try { res.status(201).json({ ok: true, addon: await createAddon(config, session, req.body || {}, requestIpHash(req)) }); }
  catch (error) { catalogError(res, error); }
});
app.patch('/api/admin/catalog/addons/:id', sameOrigin, async (req, res) => {
  const session = await requirePermission(req, res, 'catalog.write');
  if (!session) return;
  const body = req.body || {};
  if (['setup_amount_minor','monthly_amount_minor','annual_amount_minor','currency'].some(key => Object.prototype.hasOwnProperty.call(body,key)) && !hasPermission(session, 'pricing.write')) return res.status(403).json({ error: 'pricing_permission_required' });
  if (body.active === true && !hasPermission(session, 'catalog.publish')) return res.status(403).json({ error: 'publish_permission_required' });
  try { res.json({ ok: true, addon: await updateAddon(config, session, req.params.id, body, requestIpHash(req)) }); }
  catch (error) { catalogError(res, error); }
});
app.post('/api/admin/catalog/publication', sameOrigin, async (req, res) => {
  const session = await loadAdminSession(req, res);
  if (!session) return;
  if (!session.roles.includes('Owner')) return res.status(403).json({ error: 'owner_required' });
  try { res.json({ ok: true, ...(await setCatalogApproval(config, session, req.body && req.body.approved, requestIpHash(req)) ) }); }
  catch (error) { catalogError(res, error); }
});
app.get('/api/admin/overview', async (req, res) => {
  const session = await loadAdminSession(req, res);
  if (!session) return;
  if (!hasPermission(session, 'dashboard.read')) return res.status(403).json({ error: 'permission_denied' });
  try {
    const pool = require('./src/db').getPool(config);
    const org = await pool.query("SELECT id FROM organizations WHERE slug=$1 AND status='active' LIMIT 1", [config.organizationSlug]);
    if (!org.rowCount) return res.status(503).json({ error: 'organization_not_configured' });
    const organizationId = org.rows[0].id;
    const [customers, leads, projects, quotes, tickets, tasks] = await Promise.all([
      pool.query('SELECT count(*)::integer AS count FROM customers WHERE organization_id=$1',[organizationId]),
      pool.query('SELECT count(*)::integer AS count FROM leads WHERE organization_id=$1',[organizationId]),
      pool.query('SELECT count(*)::integer AS count FROM projects WHERE organization_id=$1',[organizationId]),
      pool.query('SELECT count(*)::integer AS count FROM quotes WHERE organization_id=$1',[organizationId]),
      pool.query('SELECT count(*)::integer AS count FROM support_tickets WHERE organization_id=$1',[organizationId]),
      pool.query('SELECT count(*)::integer AS count FROM tasks WHERE organization_id=$1',[organizationId])
    ]);
    res.json({ ok: true, counts: { customers:customers.rows[0].count, leads:leads.rows[0].count, projects:projects.rows[0].count, quotes:quotes.rows[0].count, tickets:tickets.rows[0].count, tasks:tasks.rows[0].count } });
  } catch (error) {
    console.error('Admin overview unavailable', { code: error && error.code || 'unknown' });
    res.status(503).json({ error: 'overview_unavailable' });
  }
});
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.use((err, _req, res, _next) => { console.error('Request failed', { name: err && err.name || 'Error', code: err && err.code || 'unknown' }); if (!res.headersSent) res.status(500).json({ error: 'internal_error' }); });
if (require.main === module) {
  const server = app.listen(config.port, () => console.log('ATSH AI listening on ' + config.port));
  async function shutdown() { server.close(async () => { try { await closePool(); process.exit(0); } catch { process.exit(1); } }); setTimeout(() => process.exit(1), 10000).unref(); }
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
module.exports = { app };