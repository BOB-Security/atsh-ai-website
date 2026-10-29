'use strict';
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('node:path');
const { loadConfig } = require('./src/config');
const { checkDatabase, closePool } = require('./src/db');
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
app.get('/api/public/catalog', (_req, res) => res.status(503).json({ error: 'catalog_not_configured', message: 'الخدمات والأسعار غير متاحة حتى التحقق من مخطط قاعدة البيانات الحالية واعتماد الكتالوج.' }));
app.post('/api/public/project-inquiries', (_req, res) => res.status(503).json({ error: 'intake_not_configured', message: 'لم يتم تفعيل حفظ الطلبات قبل التحقق من قاعدة البيانات الحية؛ لم يتم حفظ بياناتك.' }));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.use((err, _req, res, _next) => { console.error('Request failed', { name: err && err.name || 'Error', code: err && err.code || 'unknown' }); if (!res.headersSent) res.status(500).json({ error: 'internal_error' }); });
if (require.main === module) {
  const server = app.listen(config.port, () => console.log('ATSH AI listening on ' + config.port));
  async function shutdown() { server.close(async () => { try { await closePool(); process.exit(0); } catch { process.exit(1); } }); setTimeout(() => process.exit(1), 10000).unref(); }
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
module.exports = { app };