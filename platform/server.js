'use strict';
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('node:path');
const { loadConfig } = require('./src/config');
const { checkDatabase, closePool } = require('./src/db');
const publicRoutes = require('./src/routes/public');
const adminRoutes = require('./src/routes/admin');
const assistantRoutes = require('./src/routes/assistant');
const opsRoutes = require('./src/routes/ops');

const config = loadConfig();
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], baseUri: ["'self'"], objectSrc: ["'none'"],
  frameAncestors: ["'none'"], imgSrc: ["'self'", 'data:', 'https:'],
  styleSrc: ["'self'", "'unsafe-inline'"], scriptSrc: ["'self'"],
  connectSrc: ["'self'"], upgradeInsecureRequests: config.production ? [] : null
}}}));
app.use(compression());
app.use(express.json({ limit: '64kb', strict: true }));
app.use(cookieParser());
app.use((req, res, next) => {
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Cache-Control', req.path.startsWith('/api') ? 'no-store' : 'public, max-age=300');
  next();
});
const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-8', legacyHeaders: false });
app.use('/api', publicLimiter);
app.locals.organizationId = process.env.DEFAULT_ORGANIZATION_ID || '';
app.locals.config = config;
app.get('/health', (_req,res) => res.status(200).json({ok:true,service:'atsh-ai-platform',version:'2.0.0'}));
app.get('/ready', async (_req,res) => {
  try {
    if (!app.locals.organizationId) return res.status(503).json({ok:false,reason:'organization_not_configured'});
    const db = await checkDatabase(config);
    res.json({ok:true,database:db.ok});
  } catch { res.status(503).json({ok:false,database:false}); }
});
app.use('/api/public', publicRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/public/assistant', assistantRoutes);
app.use('/api/ops', opsRoutes);
app.use(express.static(path.join(__dirname,'public'), { index: 'index.html', fallthrough: true }));
app.use((req,res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({error:'المسار غير موجود.'});
  res.status(404).sendFile(path.join(__dirname,'public','404.html'), err => { if (err && !res.headersSent) res.status(404).send('Not found'); });
});
app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({error:'حجم البيانات أكبر من المسموح.'});
  if (err?.name === 'ZodError') return res.status(400).json({error:'البيانات غير صالحة.'});
  console.error('request_error', { name:err.name, message:config.production?'request failed':err.message });
  res.status(500).json({error:'حدث خطأ داخلي. حاول لاحقًا.'});
});
const server = app.listen(config.port, async () => {
  try {
    if (!app.locals.organizationId && config.databaseUrl) {
      const { getPool } = require('./src/db');
      const result = await getPool().query('SELECT id FROM organizations WHERE slug=$1 LIMIT 1', [config.defaultOrganizationSlug]);
      app.locals.organizationId = result.rows[0]?.id || '';
    }
    console.log(`ATSH AI platform listening on ${config.port}; organization=${app.locals.organizationId ? 'configured' : 'missing'}`);
  } catch (error) { console.error('platform_startup_warning', { message: config.production ? 'database organization lookup failed' : error.message }); }
});
async function shutdown() { server.close(); await closePool(); process.exit(0); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
module.exports = app;
