'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { loadConfig } = require('./src/config');
const { createDatabase } = require('./src/database');
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function createApp(overrides = {}) {
  const config = overrides.config || loadConfig();
  const database = overrides.database || createDatabase(config);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
  app.use(helmet({
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], baseUri: ["'self'"], objectSrc: ["'none'"],
      frameAncestors: ["'none'"], formAction: ["'self'"], imgSrc: ["'self'", 'data:', 'https:'],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'], fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      scriptSrc: ["'self'"], connectSrc: ["'self'"],
      upgradeInsecureRequests: config.nodeEnv === 'production' ? [] : null
    } },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  }));
  app.use(express.json({ limit: '24kb', strict: true }));
  app.use('/api/public', rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html', etag: true, maxAge: config.nodeEnv === 'production' ? '1h' : 0 }));
  app.get('/health', (_req, res) => res.status(200).json({ ok: true, service: 'atsh-ai-greenfield' }));
  app.get('/ready', async (_req, res) => {
    try {
      const connected = await database.checkConnection();
      if (!connected) return res.status(503).json({ ok: false, database: 'unavailable' });
      return res.status(200).json({ ok: true, database: 'connected', mode: 'read-only-foundation' });
    } catch (error) {
      return res.status(503).json({ ok: false, database: error.code === 'DATABASE_NOT_CONFIGURED' ? 'not_configured' : 'unavailable', code: error.code === 'DATABASE_NOT_CONFIGURED' ? error.code : 'DATABASE_CONNECTION_FAILED' });
    }
  });
  app.get('/api/diagnostics/database-schema', async (req, res) => {
    if (!config.diagnosticsToken || !safeEqual(req.get('authorization') || '', 'Bearer ' + config.diagnosticsToken)) return res.status(404).json({ error: 'not_found' });
    try {
      const columns = await database.inspectSchema();
      const tables = new Map();
      for (const column of columns) {
        const key = column.table_schema + '.' + column.table_name;
        if (!tables.has(key)) tables.set(key, { schema: column.table_schema, table: column.table_name, columns: [] });
        tables.get(key).columns.push({ name: column.column_name, type: column.data_type, nullable: column.is_nullable === 'YES' });
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ ok: true, readOnly: true, tableCount: tables.size, tables: Array.from(tables.values()) });
    } catch (error) {
      console.error('Database schema inspection failed:', error.code || 'unknown');
      return res.status(503).json({ error: 'schema_inspection_unavailable' });
    }
  });
  app.post('/api/public/inquiries', (_req, res) => res.status(503).json({
    error: 'intake_not_enabled',
    message: 'لم يتم تفعيل استقبال الطلبات قبل مطابقة مخطط قاعدة البيانات الحالية. لم يتم حفظ أي طلب.'
  }));
  app.get('*path', (req, res, next) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not_found' });
    return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'), error => error && next(error));
  });
  app.use((error, _req, res, _next) => {
    if (error && error.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
    if (error && error.type === 'entity.too.large') return res.status(413).json({ error: 'request_too_large' });
    console.error('Unhandled request error:', error.code || error.name || 'unknown');
    return res.status(500).json({ error: 'internal_error' });
  });
  return { app, database, config };
}
if (require.main === module) {
  const config = loadConfig();
  const result = createApp({ config });
  const server = result.app.listen(config.port, '0.0.0.0', () => console.log('ATSH AI greenfield listening on port ' + config.port));
  const shutdown = () => server.close(async () => { await result.database.close().catch(() => {}); process.exit(0); });
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
module.exports = { createApp };
