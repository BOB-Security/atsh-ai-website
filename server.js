'use strict';
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('node:path');
const { loadConfig } = require('./src/config');
const { checkDatabase, closePool } = require('./src/db');
const { validateInquiry, createProjectInquiry, getPublicCatalog } = require('./src/intake');
const config = loadConfig();
const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"] } } }));
app.use(compression());
app.use(express.json({ limit: '64kb' }));
app.use('/api/public', rateLimit({ windowMs: 900000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false }));
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
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.use((err, _req, res, _next) => { console.error('Request failed', { name: err && err.name || 'Error', code: err && err.code || 'unknown' }); if (!res.headersSent) res.status(500).json({ error: 'internal_error' }); });
if (require.main === module) {
  const server = app.listen(config.port, () => console.log('ATSH AI listening on ' + config.port));
  async function shutdown() { server.close(async () => { try { await closePool(); process.exit(0); } catch { process.exit(1); } }); setTimeout(() => process.exit(1), 10000).unref(); }
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
module.exports = { app };