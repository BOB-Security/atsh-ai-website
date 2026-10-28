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
const teamRoutes = require('./src/routes/team');
const portalRoutes = require('./src/routes/portal');

const config = loadConfig();
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], baseUri: ["'self'"], objectSrc: ["'none'"],
  frameAncestors: ["'none'"], imgSrc: ["'self'", 'data:', 'https:'],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'], scriptSrc: ["'self'"],
  connectSrc: ["'self'"], upgradeInsecureRequests: config.production ? [] : null
}}}));
app.use(compression());
app.use(express.json({ limit: '1mb', strict: true }));
app.use(cookieParser());
app.use((req, res, next) => {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method) && req.get('origin')) { try { if (new URL(req.get('origin')).host !== req.get('host')) return res.status(403).json({error:'طلب من مصدر غير مسموح.'}); } catch { return res.status(403).json({error:'مصدر الطلب غير صالح.'}); } }
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Cache-Control', req.path.startsWith('/api') ? 'no-store' : 'public, max-age=300');
  next();
});
const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-8', legacyHeaders: false });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: {error:'محاولات دخول كثيرة. انتظر ثم حاول مجددًا.'} });
const intakeLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false, message: {error:'تم تجاوز عدد الطلبات المسموح مؤقتًا.'} });
const assistantLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: {error:'تم تجاوز حد المحادثات مؤقتًا.'} });
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
app.use('/api/public/project-inquiries', intakeLimiter);
app.use('/api/public/pricing/estimate', intakeLimiter);
app.use('/api/public/support-tickets', intakeLimiter);
app.use('/api/public/track', intakeLimiter);
app.use('/api/admin/auth/login', loginLimiter);
app.use('/api/admin/auth/password-reset/request', loginLimiter);
app.use('/api/admin/auth/password-reset/confirm', loginLimiter);
app.use('/api/portal/login', loginLimiter);
app.use('/api/portal/activate', intakeLimiter);
app.use('/api/public/assistant', assistantLimiter, assistantRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ops', opsRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/portal', portalRoutes);
app.get('/portal',(_req,res)=>res.redirect(302,'/portal.html'));
app.get('/login',(_req,res)=>res.redirect(302,'/portal.html'));
app.get('/build',(_req,res)=>res.redirect(302,'/project-builder.html'));
app.get('/contact',(_req,res)=>res.redirect(302,'/project-builder.html'));
app.get('/how-it-works',(_req,res)=>res.redirect(302,'/process.html'));
app.get(['/', '/:slug'], async (req,res,next) => {
  try {
    const slug=req.path==='/'?'home':String(req.params.slug||'').replace(/\.html$/,'');
    if (!/^[a-z0-9-]{2,80}$/.test(slug)) return next();
    if (!app.locals.organizationId) return next();
    const {getPool}=require('./src/db');
    const result=await getPool().query('SELECT slug,title_ar,title_en,body_ar,body_en FROM site_pages WHERE organization_id=$1 AND slug=$2 AND visible=true LIMIT 1',[app.locals.organizationId,slug]);
    const page=result.rows[0]; if(!page)return next();
    const locale=req.acceptsLanguages('en')&&!req.acceptsLanguages('ar')?'en':'ar';
    const title=locale==='en'?page.title_en:page.title_ar, blocks=locale==='en'?page.body_en:page.body_ar;
    const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const allBlocks=Array.isArray(blocks)?blocks:[], pageStyle=allBlocks.find(b=>b&&b.type==='__pageStyle')||{};
    const color=v=>/^#[0-9a-f]{6}$/i.test(v||'')?v:null;
    const safeHref=v=>{const href=String(v||'').trim();return href.startsWith('/')||/^https:\/\//i.test(href)?href:null;};
    const body=allBlocks.filter(b=>b&&b.type!=='__pageStyle').map(b=>{
      const text=esc(b.text||b.content||b.title||''),bg=b.type==='card'?color(b.background):null,fg=color(b.color),style=(bg?'background:'+bg+';':'')+(fg?'color:'+fg+';':'')+(['left','center','right'].includes(b.align)?'text-align:'+b.align+';':'');
      if(b.type==='heading')return '<h2 style="'+style+'">'+text+'</h2>';
      if(b.type==='image'){const src=String(b.src||b.image||'').trim();if(!src||(!src.startsWith('/')&&!/^https:\/\//i.test(src)&&!/^data:image\/(png|jpeg|webp);base64,/i.test(src)))return '';return '<figure class="cms-image" style="'+style+'"><img src="'+esc(src)+'" alt="'+esc(b.alt||'')+'" loading="lazy" style="max-width:100%;height:auto;border-radius:12px"><figcaption>'+esc(b.alt||'')+'</figcaption></figure>';}
      if(b.type==='card'){const src=String(b.src||b.image||'').trim(),img=src&&(src.startsWith('/')||/^https:\/\//i.test(src)||/^data:image\/(png|jpeg|webp);base64,/i.test(src))?'<img src="'+esc(src)+'" alt="'+esc(b.alt||'')+'" loading="lazy" style="width:100%;height:auto;border-radius:10px;margin-bottom:12px">':'';const columns=[1,2,3,4].includes(Number(b.columns))?Number(b.columns):1;return '<article class="cms-card" style="'+style+'display:inline-block;vertical-align:top;width:calc(100% / '+columns+' - 16px);margin:8px">'+img+'<h3>'+text+'</h3></article>';}
      if(b.type==='list'&&Array.isArray(b.items))return '<ul style="'+style+'">'+b.items.map(i=>'<li>'+esc(i)+'</li>').join('')+'</ul>';
      if(b.type==='link'){const href=safeHref(b.href);return href?'<p style="'+style+'"><a class="button primary" href="'+esc(href)+'">'+text+'</a></p>':'<p style="'+style+'">'+text+'</p>';}
      return '<p style="'+style+'">'+text+'</p>';
    }).join('');
    const pageBg=color(pageStyle.background),pageSurface=color(pageStyle.surface),pageText=color(pageStyle.color);
    const pageCss='body{'+(pageBg?'background:'+pageBg+';':'')+(pageText?'color:'+pageText+';':'')+'}.cms-card{padding:24px;margin:16px 0;border:1px solid var(--line);border-radius:var(--radius);background:'+(pageSurface||'var(--panel)')+'}.cms-image{margin:24px 0}';
    res.status(200).type('html').send('<!doctype html><html lang="'+locale+'" dir="'+(locale==='ar'?'rtl':'ltr')+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+' — ATSH AI</title><link rel="stylesheet" href="/styles.css"><style>'+pageCss+'</style></head><body><header class="header"><a class="brand" href="/">atsh<span>·</span>ai</a><a class="button primary" href="/project-builder.html">ابدأ مشروعك</a></header><main class="wrap section"><p class="eyebrow">ATSH AI</p><h1>'+esc(title)+'</h1>'+body+'</main><footer class="footer"><div class="wrap"><a href="/">ATSH AI</a></div></footer></body></html>');
  } catch(err) { next(err); }
});
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
