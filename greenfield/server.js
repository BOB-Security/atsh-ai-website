'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { loadConfig } = require('./src/config');
const { createDatabase } = require('./src/database');
const { defaultCatalog } = require('./src/default-catalog');
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
  app.post('/api/admin/login', rateLimit({ windowMs: 900000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 1024) {
      return res.status(400).json({ error: 'invalid_credentials', message: 'أدخل البريد الإلكتروني وكلمة المرور.' });
    }
    try {
      const user = await database.findAdminUser(email);
      if (!user || user.status !== 'active' || user.organization_status !== 'active') return res.status(401).json({ error: 'invalid_credentials', message: 'بيانات الدخول غير صحيحة.' });
      let record;
      try {
        const stored = user.password_hash || '';
        if (stored.startsWith('scrypt' + String.fromCharCode(36))) {
          const parts = stored.split(String.fromCharCode(36));
          if (parts.length === 3) record = { salt: parts[1], hash: parts[2] };
        } else {
          record = JSON.parse(stored);
        }
      } catch { record = null; }
      if (!record || typeof record.salt !== 'string' || typeof record.hash !== 'string' || !/^[a-f0-9]{32,128}$/i.test(record.salt) || !/^[a-f0-9]{128}$/i.test(record.hash)) {
        return res.status(503).json({ error: 'admin_credentials_format_unsupported', message: 'تنسيق بيانات المصادقة يحتاج إلى مراجعة قبل تفعيل الدخول.' });
      }
      const derived = await new Promise((resolve, reject) => crypto.scrypt(password, record.salt, 64, (error, key) => error ? reject(error) : resolve(key.toString('hex'))));
      if (!safeEqual(derived, record.hash)) return res.status(401).json({ error: 'invalid_credentials', message: 'بيانات الدخول غير صحيحة.' });
      const token = crypto.randomBytes(32).toString('base64url');
      const csrf = crypto.randomBytes(32).toString('base64url');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const ipHash = crypto.createHash('sha256').update(String(req.ip || req.socket?.remoteAddress || '')).digest('hex');
      await database.createAdminSession(user.id, tokenHash, { ipHash });
      const secure = config.nodeEnv === 'production' ? '; Secure' : '';
      res.setHeader('Set-Cookie', [
        'atsh_admin_session=' + encodeURIComponent(token) + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800' + secure,
        'atsh_admin_csrf=' + encodeURIComponent(csrf) + '; Path=/; SameSite=Strict; Max-Age=28800' + secure
      ]);
      res.setHeader('Cache-Control', 'no-store');
      const permissions = (Array.isArray(user.role_permission_sets) ? user.role_permission_sets : []).flat().filter(value => typeof value === 'string');
      return res.json({ ok: true, user: { id: user.id, email: user.email, name: user.full_name, permissions }, csrfToken: csrf });
    } catch (error) {
      if (error.code === 'ADMIN_SCHEMA_MISMATCH') return res.status(503).json({ error: 'admin_not_ready', message: 'قاعدة البيانات غير جاهزة لتفعيل الإدارة.' });
      console.error('Admin login unavailable:', error.code || 'unknown');
      return res.status(503).json({ error: 'admin_unavailable', message: 'تعذر تسجيل الدخول الآن.' });
    }
  });
  const readCookie = (header, name) => {
    const part = String(header || '').split(';').map(value => value.trim()).find(value => value.startsWith(name + '='));
    if (!part) return '';
    try { return decodeURIComponent(part.slice(name.length + 1)); } catch { return ''; }
  };
  const hashAdminToken = token => crypto.createHash('sha256').update(token).digest('hex');
  const getCurrentAdmin = async req => {
    const token = readCookie(req.headers.cookie, 'atsh_admin_session');
    if (!token || token.length < 32 || token.length > 256) return null;
    const user = await database.getAdminSession(hashAdminToken(token));
    if (!user) return null;
    const permissions = (Array.isArray(user.role_permission_sets) ? user.role_permission_sets : []).flat().filter(value => typeof value === 'string');
    return { user, permissions };
  };
  app.get('/api/admin/schema-readiness', async (req, res) => {
    try {
      const auth = await getCurrentAdmin(req);
      if (!auth) return res.status(401).json({ error: 'authentication_required' });
      if (!auth.permissions.includes('*') && !auth.permissions.includes('dashboard.read') && !auth.permissions.includes('reports.read')) {
        return res.status(403).json({ error: 'permission_denied' });
      }
      const columns = await database.inspectSchema();
      const present = new Map();
      for (const column of columns) {
        if (!column || column.table_schema !== 'public' || typeof column.table_name !== 'string' || typeof column.column_name !== 'string') continue;
        if (!present.has(column.table_name)) present.set(column.table_name, new Set());
        present.get(column.table_name).add(column.column_name);
      }
      const groups = {
        'المصادقة والصلاحيات': {
          users: ['id','organization_id','email','full_name','password_hash','status','last_login_at','updated_at'],
          organizations: ['id','status'], roles: ['id','organization_id','name','permissions'],
          user_roles: ['user_id','role_id'], auth_sessions: ['id','user_id','token_hash','expires_at','last_seen_at','created_at'],
          audit_logs: ['id','organization_id','actor_user_id','action','entity_type','entity_id','details','ip_hash','created_at']
        },
        'ملخص الإدارة': {
          leads: ['organization_id','status'], projects: ['organization_id'], support_tickets: ['organization_id','status'],
          service_categories: ['organization_id','active'], service_plans: ['organization_id','active']
        },
        'طلبات العملاء': {
          leads: ['id','organization_id','customer_id','reference','status','source','project_goal','solution_type','created_at'],
          customers: ['id','organization_id','display_name','email','phone']
        },
        'الخدمات والباقات': {
          service_categories: ['id','organization_id','slug','name_ar','name_en','description_ar','description_en','active','sort_order'],
          service_plans: ['id','organization_id','category_id','slug','name_ar','name_en','description_ar','description_en','setup_amount_minor','monthly_amount_minor','annual_amount_minor','currency','features','active','sort_order']
        },
        'إعدادات الموقع': { site_settings: ['organization_id','settings','updated_by','updated_at'] }
      };
      const report = Object.entries(groups).map(([name, tables]) => {
        const missing = [];
        for (const [table, required] of Object.entries(tables)) {
          const actual = present.get(table) || new Set();
          const absent = required.filter(column => !actual.has(column));
          if (absent.length) missing.push({ table, missingColumns: absent });
        }
        return { name, ready: missing.length === 0, missing };
      });
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ ok: true, readOnly: true, groups: report });
    } catch (error) {
      const code = typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : 'unknown';
      console.error('Admin schema readiness failed:', code);
      return res.status(503).json({ error: 'schema_readiness_unavailable', diagnosticCode: code });
    }
  });
  app.get('/api/admin/me', async (req, res) => {
    try {
      const auth = await getCurrentAdmin(req);
      if (!auth) return res.status(401).json({ error: 'authentication_required' });
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ ok: true, user: { id: auth.user.id, email: auth.user.email, name: auth.user.full_name, permissions: auth.permissions }, csrfToken: readCookie(req.headers.cookie, 'atsh_admin_csrf') });
    } catch (error) {
      console.error('Admin session check failed:', error.code || 'unknown');
      return res.status(503).json({ error: 'admin_unavailable' });
    }
  });
  app.post('/api/admin/logout', async (req, res) => {
    const cookieToken = readCookie(req.headers.cookie, 'atsh_admin_csrf');
    const headerToken = req.get('x-csrf-token') || '';
    if (!cookieToken || !safeEqual(cookieToken, headerToken)) return res.status(403).json({ error: 'csrf_validation_failed' });
    try {
      const token = readCookie(req.headers.cookie, 'atsh_admin_session');
      if (token && token.length <= 256) {
        const ipHash = crypto.createHash('sha256').update(String(req.ip || req.socket?.remoteAddress || '')).digest('hex');
        await database.deleteAdminSession(hashAdminToken(token), { ipHash });
      }
      const secure = config.nodeEnv === 'production' ? '; Secure' : '';
      res.setHeader('Set-Cookie', [
        'atsh_admin_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' + secure,
        'atsh_admin_csrf=; Path=/; SameSite=Strict; Max-Age=0' + secure
      ]);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ ok: true });
    } catch (error) {
      console.error('Admin logout failed:', error.code || 'unknown');
      return res.status(503).json({ error: 'admin_unavailable' });
    }
  });
  app.get('/api/admin/members', async (req,res)=>{
    try{
      const auth=await getCurrentAdmin(req);if(!auth)return res.status(401).json({error:'authentication_required'});
      if(!auth.permissions.includes('*')&&!auth.permissions.includes('admin.manage'))return res.status(403).json({error:'permission_denied'});
      const data=await database.listAdminMembers(auth.user.organization_id);
      res.setHeader('Cache-Control','no-store');return res.json({ok:true,...data});
    }catch(error){console.error('Admin member list failed:',error.code||'unknown');return res.status(503).json({error:'admin_members_unavailable'});}
  });
  app.post('/api/admin/members', async (req,res)=>{
    try{
      const auth=await getCurrentAdmin(req);if(!auth)return res.status(401).json({error:'authentication_required'});
      if(!auth.permissions.includes('*')&&!auth.permissions.includes('admin.manage'))return res.status(403).json({error:'permission_denied'});
      const input=req.body?.member;
      if(!input||typeof input!=='object'||Array.isArray(input))return res.status(400).json({error:'invalid_member'});
      const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
      const full_name=typeof input.full_name==='string'?input.full_name.trim():'';
      const password=typeof input.password==='string'?input.password:'';
      const role_id=typeof input.role_id==='string'?input.role_id:'';
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||full_name.length<2||full_name.length>160||password.length<12||password.length>128||!role_id)
        return res.status(400).json({error:'invalid_member',message:'أدخل اسمًا وبريدًا صحيحًا وكلمة مرور مؤقتة لا تقل عن 12 حرفًا وحدد الدور.'});
      const salt=crypto.randomBytes(16).toString('hex');
      const hash=await new Promise((resolve,reject)=>crypto.scrypt(password,salt,64,(error,key)=>error?reject(error):resolve(key.toString('hex'))));
      const member=await database.createAdminMember(auth.user.organization_id,auth.user.id,{email,full_name,role_id,password_hash:'scrypt
    try{const auth=await getCurrentAdmin(req);if(!auth)return res.status(401).json({error:'authentication_required'});if(!auth.permissions.includes('*')&&!auth.permissions.includes('site.manage'))return res.status(403).json({error:'permission_denied'});
    const result=await database.getSiteSettings(auth.user.organization_id);res.setHeader('Cache-Control','no-store');return res.json({ok:true,settings:result.settings||{},updatedAt:result.updated_at||null});
    }catch(error){if(error.code==='SITE_SETTINGS_SCHEMA_MISMATCH')return res.status(503).json({error:'site_settings_not_ready',message:'يلزم تطبيق ترحيل إعدادات الموقع.'});console.error('Admin site settings read failed:',error.code||'unknown');return res.status(503).json({error:'site_settings_unavailable'});}
  });
  app.put('/api/admin/site-settings', async (req,res)=>{
    const csrfCookie=readCookie(req.headers.cookie,'atsh_admin_csrf');if(!csrfCookie||!safeEqual(csrfCookie,req.get('x-csrf-token')||''))return res.status(403).json({error:'csrf_validation_failed'});
    try{const auth=await getCurrentAdmin(req);if(!auth)return res.status(401).json({error:'authentication_required'});if(!auth.permissions.includes('*')&&!auth.permissions.includes('site.manage'))return res.status(403).json({error:'permission_denied'});
    const input=req.body?.settings;const allowed=['hero_title','hero_description','logo_url','hero_background_url','primary_color','accent_color','contact_email','page_content'];
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.includes(key)))return res.status(400).json({error:'invalid_settings'});
    const limits={hero_title:180,hero_description:1000,logo_url:1000,hero_background_url:1000,primary_color:7,accent_color:7,contact_email:254};const settings={};
    for(const key of Object.keys(limits)){if(!(key in input))continue;const value=input[key]==null?'':input[key];if(typeof value!=='string'||value.length>limits[key])return res.status(400).json({error:'invalid_settings'});settings[key]=value.trim();}
    if(input.page_content!==undefined){
      if(!input.page_content||typeof input.page_content!=='object'||Array.isArray(input.page_content)||Object.keys(input.page_content).some(key=>!['home','services','pricing','process','about','faq'].includes(key)))return res.status(400).json({error:'invalid_page_content'});
      settings.page_content={};
      for(const [page,fields] of Object.entries(input.page_content)){
        if(!fields||typeof fields!=='object'||Array.isArray(fields)||Object.keys(fields).some(key=>!['title','description'].includes(key)))return res.status(400).json({error:'invalid_page_content'});
        const item={};for(const field of ['title','description']){const value=fields[field]===undefined?'':fields[field];if(typeof value!=='string'||value.length>(field==='title'?180:1000))return res.status(400).json({error:'invalid_page_content'});item[field]=value.trim();}
        settings.page_content[page]=item;
      }
    }
    for(const key of ['primary_color','accent_color'])if(settings[key]&&!/^#[0-9a-f]{6}$/i.test(settings[key]))return res.status(400).json({error:'invalid_settings',message:'صيغة اللون غير صحيحة.'});
    if(settings.logo_url&&!/^https:\/\//i.test(settings.logo_url))return res.status(400).json({error:'invalid_settings',message:'رابط الشعار يجب أن يبدأ بـ https.'});
    if(settings.hero_background_url&& !(/^https:\/\//i.test(settings.hero_background_url)||(/^\/(?!\/)[A-Za-z0-9_./-]+$/.test(settings.hero_background_url)&&!settings.hero_background_url.split('/').includes('..'))))return res.status(400).json({error:'invalid_settings',message:'استخدم رابط HTTPS أو مسارًا محليًا يبدأ بشرطة واحدة.'});
    if(settings.contact_email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.contact_email))return res.status(400).json({error:'invalid_settings',message:'البريد الإلكتروني غير صحيح.'});
    const previous=await database.getSiteSettings(auth.user.organization_id);
    const merged={...(previous.settings||{}),...settings,page_content:{...((previous.settings||{}).page_content||{}),...(settings.page_content||{})}};
    const saved=await database.saveSiteSettings(auth.user.organization_id,auth.user.id,merged);res.setHeader('Cache-Control','no-store');return res.json({ok:true,settings:saved.settings,updatedAt:saved.updated_at});
    }catch(error){if(error.code==='SITE_SETTINGS_SCHEMA_MISMATCH')return res.status(503).json({error:'site_settings_not_ready',message:'يلزم تطبيق ترحيل إعدادات الموقع.'});console.error('Admin site settings save failed:',error.code||'unknown');return res.status(503).json({error:'site_settings_unavailable',message:'تعذر حفظ إعدادات الموقع.'});}
  });
  app.get('/api/public/site-settings',async(_req,res)=>{
    try{if(!config.publicOrganizationId)return res.json({ok:true,settings:{}});const result=await database.getSiteSettings(config.publicOrganizationId);res.setHeader('Cache-Control','public,max-age=30,stale-while-revalidate=60');return res.json({ok:true,settings:result.settings||{}});}
    catch(error){if(error.code==='SITE_SETTINGS_SCHEMA_MISMATCH')return res.status(200).json({ok:true,settings:{}});console.error('Public site settings read failed:',error.code||'unknown');return res.status(200).json({ok:true,settings:{}});}
  });
  app.get('/api/admin/overview', async (req, res) => {
    try {
      const auth = await getCurrentAdmin(req);
      if (!auth) return res.status(401).json({ error: 'authentication_required' });
      if (!auth.permissions.includes('*') && !auth.permissions.includes('dashboard.read') && !auth.permissions.includes('reports.read')) {
        return res.status(403).json({ error: 'permission_denied' });
      }
      const overview = await database.getAdminOverview(auth.user.organization_id);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ ok: true, overview });
    } catch (error) {
      if (error.code === 'ADMIN_OVERVIEW_SCHEMA_MISMATCH') return res.status(503).json({ error: 'admin_overview_not_ready', message: 'بعض جداول لوحة الإدارة تحتاج إلى مراجعة توافق.' });
      console.error('Admin overview failed:', error.code || 'unknown');
      return res.status(503).json({ error: 'admin_overview_unavailable' });
    }
  });
  app.get('/api/admin/leads', async (req, res) => {
    try {
      const auth = await getCurrentAdmin(req);
      if (!auth) return res.status(401).json({ error: 'authentication_required' });
      if (!auth.permissions.includes('*') && !auth.permissions.includes('leads.read') && !auth.permissions.includes('sales.read')) {
        return res.status(403).json({ error: 'permission_denied' });
      }
      const leads = await database.listAdminLeads(auth.user.organization_id, 50);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ ok: true, leads });
    } catch (error) {
      if (error.code === 'ADMIN_LEADS_SCHEMA_MISMATCH') return res.status(503).json({ error: 'admin_leads_not_ready', message: 'بيانات الطلبات تحتاج إلى مراجعة توافق قاعدة البيانات.' });
      console.error('Admin leads read failed:', error.code || 'unknown');
      return res.status(503).json({ error: 'admin_leads_unavailable' });
    }
  });
  app.get('/api/admin/catalog', async (req, res) => {
    try {
      const auth = await getCurrentAdmin(req);
      if (!auth) return res.status(401).json({ error: 'authentication_required' });
      if (!auth.permissions.includes('*') && !auth.permissions.includes('catalog.read') && !auth.permissions.includes('catalog.manage')) {
        return res.status(403).json({ error: 'permission_denied' });
      }
      const categories = await database.listAdminCatalog(auth.user.organization_id);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ ok: true, categories });
    } catch (error) {
      if (error.code === 'ADMIN_CATALOG_SCHEMA_MISMATCH') return res.status(503).json({ error: 'admin_catalog_not_ready', message: 'كتالوج الإدارة يحتاج إلى مراجعة توافق قاعدة البيانات.' });
      console.error('Admin catalog read failed:', error.code || 'unknown');
      return res.status(503).json({ error: 'admin_catalog_unavailable' });
    }
  });
  app.get('/api/public/catalog', async (_req, res) => {
    try {
      const categories = await database.listPublicCatalog();
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
      if (!categories.length) {
        return res.status(200).json({
          ok: true,
          provisional: true,
          currencyNote: 'Starter estimates only. Amounts are in minor currency units and are not a final offer.',
          categories: defaultCatalog
        });
      }
      return res.status(200).json({ ok: true, provisional: false, currencyNote: 'All amounts are returned in minor currency units as stored in the organization catalog.', categories });
    } catch (error) {
      if (error.code === 'CATALOG_NOT_CONFIGURED') {
        res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
        return res.status(200).json({
          ok: true,
          provisional: true,
          currencyNote: 'Starter estimates only. Amounts are in minor currency units and are not a final offer.',
          categories: defaultCatalog
        });
      }
      if (error.code === 'CATALOG_SCHEMA_MISMATCH') {
        return res.status(503).json({ error: 'catalog_not_ready', message: 'كتالوج الأسعار يحتاج إلى مراجعة توافق قاعدة البيانات.' });
      }
      console.error('Public catalog read failed:', error.code || 'unknown');
      return res.status(503).json({ error: 'catalog_unavailable', message: 'تعذر تحميل قائمة الخدمات الآن.' });
    }
  });
  app.post('/api/public/inquiries', async (req, res) => {
    if (!config.intakeEnabled || !config.publicOrganizationId) {
      return res.status(503).json({
        error: 'intake_not_enabled',
        message: 'استقبال الطلبات غير مفعّل بعد. لم يتم حفظ أي طلب.'
      });
    }
    const body = req.body;
    const allowed = new Set(['name','email','phone','company','service','size','pages','languages','brand','features','hosting','goal','audience','integrations','deadline','constraints','consent']);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.has(key))) {
      return res.status(400).json({ error: 'invalid_request', message: 'بيانات الطلب غير صالحة.' });
    }
    const str = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
    if (!str(body.name, 160) || !str(body.email, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ||
        !str(body.service, 120) || !str(body.goal, 4000) || body.goal.trim().length < 20 ||
        (body.phone != null && (typeof body.phone !== 'string' || body.phone.length > 40)) ||
        (body.company != null && (typeof body.company !== 'string' || body.company.length > 200)) ||
        (body.features != null && (!Array.isArray(body.features) || body.features.length > 30 || body.features.some(v => typeof v !== 'string' || v.length > 160))) ||
        body.consent !== true) {
      return res.status(400).json({ error: 'validation_failed', message: 'أكمل البيانات المطلوبة ووافق على معالجة بيانات الطلب قبل الإرسال.' });
    }
    for (const key of ['size','pages','languages','brand','hosting','audience','integrations','deadline','constraints']) {
      if (body[key] != null && (typeof body[key] !== 'string' || body[key].length > 2000)) {
        return res.status(400).json({ error: 'validation_failed', message: 'أحد الحقول يتجاوز الحد المسموح.' });
      }
    }
    try {
      const inquiry = await database.createInquiry({
        name: body.name.trim(), email: body.email.trim(), phone: (body.phone || '').trim(),
        company: (body.company || '').trim(), service: body.service.trim(), size: body.size || '',
        pages: body.pages || '', languages: body.languages || '', brand: body.brand || '',
        features: body.features || [], hosting: body.hosting || '', goal: body.goal.trim(),
        audience: body.audience || '', integrations: body.integrations || '',
        deadline: body.deadline || '', constraints: body.constraints || ''
      });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(201).json({ ok: true, inquiry: { reference: inquiry.reference, status: inquiry.status, createdAt: inquiry.created_at }, message: 'تم استلام طلبك بنجاح.' });
    } catch (error) {
      if (error.code === 'INTAKE_NOT_ENABLED' || error.code === 'INTAKE_SCHEMA_MISMATCH') {
        return res.status(503).json({ error: 'intake_not_ready', message: 'لم يتم تفعيل استقبال الطلبات بعد مراجعة توافق قاعدة البيانات. لم يتم حفظ أي طلب.' });
      }
      console.error('Inquiry persistence failed:', error.code || 'unknown');
      return res.status(503).json({ error: 'inquiry_save_failed', message: 'تعذر حفظ الطلب الآن. لم يتم تسجيله؛ حاول لاحقًا.' });
    }
  });
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
+salt+'
    try{const auth=await getCurrentAdmin(req);if(!auth)return res.status(401).json({error:'authentication_required'});if(!auth.permissions.includes('*')&&!auth.permissions.includes('site.manage'))return res.status(403).json({error:'permission_denied'});
    const result=await database.getSiteSettings(auth.user.organization_id);res.setHeader('Cache-Control','no-store');return res.json({ok:true,settings:result.settings||{},updatedAt:result.updated_at||null});
    }catch(error){if(error.code==='SITE_SETTINGS_SCHEMA_MISMATCH')return res.status(503).json({error:'site_settings_not_ready',message:'يلزم تطبيق ترحيل إعدادات الموقع.'});console.error('Admin site settings read failed:',error.code||'unknown');return res.status(503).json({error:'site_settings_unavailable'});}
  });
  app.put('/api/admin/site-settings', async (req,res)=>{
    const csrfCookie=readCookie(req.headers.cookie,'atsh_admin_csrf');if(!csrfCookie||!safeEqual(csrfCookie,req.get('x-csrf-token')||''))return res.status(403).json({error:'csrf_validation_failed'});
    try{const auth=await getCurrentAdmin(req);if(!auth)return res.status(401).json({error:'authentication_required'});if(!auth.permissions.includes('*')&&!auth.permissions.includes('site.manage'))return res.status(403).json({error:'permission_denied'});
    const input=req.body?.settings;const allowed=['hero_title','hero_description','logo_url','hero_background_url','primary_color','accent_color','contact_email','page_content'];
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.includes(key)))return res.status(400).json({error:'invalid_settings'});
    const limits={hero_title:180,hero_description:1000,logo_url:1000,hero_background_url:1000,primary_color:7,accent_color:7,contact_email:254};const settings={};
    for(const key of Object.keys(limits)){if(!(key in input))continue;const value=input[key]==null?'':input[key];if(typeof value!=='string'||value.length>limits[key])return res.status(400).json({error:'invalid_settings'});settings[key]=value.trim();}
    if(input.page_content!==undefined){
      if(!input.page_content||typeof input.page_content!=='object'||Array.isArray(input.page_content)||Object.keys(input.page_content).some(key=>!['home','services','pricing','process','about','faq'].includes(key)))return res.status(400).json({error:'invalid_page_content'});
      settings.page_content={};
      for(const [page,fields] of Object.entries(input.page_content)){
        if(!fields||typeof fields!=='object'||Array.isArray(fields)||Object.keys(fields).some(key=>!['title','description'].includes(key)))return res.status(400).json({error:'invalid_page_content'});
        const item={};for(const field of ['title','description']){const value=fields[field]===undefined?'':fields[field];if(typeof value!=='string'||value.length>(field==='title'?180:1000))return res.status(400).json({error:'invalid_page_content'});item[field]=value.trim();}
        settings.page_content[page]=item;
      }
    }
    for(const key of ['primary_color','accent_color'])if(settings[key]&&!/^#[0-9a-f]{6}$/i.test(settings[key]))return res.status(400).json({error:'invalid_settings',message:'صيغة اللون غير صحيحة.'});
    if(settings.logo_url&&!/^https:\/\//i.test(settings.logo_url))return res.status(400).json({error:'invalid_settings',message:'رابط الشعار يجب أن يبدأ بـ https.'});
    if(settings.hero_background_url&& !(/^https:\/\//i.test(settings.hero_background_url)||(/^\/(?!\/)[A-Za-z0-9_./-]+$/.test(settings.hero_background_url)&&!settings.hero_background_url.split('/').includes('..'))))return res.status(400).json({error:'invalid_settings',message:'استخدم رابط HTTPS أو مسارًا محليًا يبدأ بشرطة واحدة.'});
    if(settings.contact_email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.contact_email))return res.status(400).json({error:'invalid_settings',message:'البريد الإلكتروني غير صحيح.'});
    const previous=await database.getSiteSettings(auth.user.organization_id);
    const merged={...(previous.settings||{}),...settings,page_content:{...((previous.settings||{}).page_content||{}),...(settings.page_content||{})}};
    const saved=await database.saveSiteSettings(auth.user.organization_id,auth.user.id,merged);res.setHeader('Cache-Control','no-store');return res.json({ok:true,settings:saved.settings,updatedAt:saved.updated_at});
    }catch(error){if(error.code==='SITE_SETTINGS_SCHEMA_MISMATCH')return res.status(503).json({error:'site_settings_not_ready',message:'يلزم تطبيق ترحيل إعدادات الموقع.'});console.error('Admin site settings save failed:',error.code||'unknown');return res.status(503).json({error:'site_settings_unavailable',message:'تعذر حفظ إعدادات الموقع.'});}
  });
  app.get('/api/public/site-settings',async(_req,res)=>{
    try{if(!config.publicOrganizationId)return res.json({ok:true,settings:{}});const result=await database.getSiteSettings(config.publicOrganizationId);res.setHeader('Cache-Control','public,max-age=30,stale-while-revalidate=60');return res.json({ok:true,settings:result.settings||{}});}
    catch(error){if(error.code==='SITE_SETTINGS_SCHEMA_MISMATCH')return res.status(200).json({ok:true,settings:{}});console.error('Public site settings read failed:',error.code||'unknown');return res.status(200).json({ok:true,settings:{}});}
  });
  app.get('/api/admin/overview', async (req, res) => {
    try {
      const auth = await getCurrentAdmin(req);
      if (!auth) return res.status(401).json({ error: 'authentication_required' });
      if (!auth.permissions.includes('*') && !auth.permissions.includes('dashboard.read') && !auth.permissions.includes('reports.read')) {
        return res.status(403).json({ error: 'permission_denied' });
      }
      const overview = await database.getAdminOverview(auth.user.organization_id);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ ok: true, overview });
    } catch (error) {
      if (error.code === 'ADMIN_OVERVIEW_SCHEMA_MISMATCH') return res.status(503).json({ error: 'admin_overview_not_ready', message: 'بعض جداول لوحة الإدارة تحتاج إلى مراجعة توافق.' });
      console.error('Admin overview failed:', error.code || 'unknown');
      return res.status(503).json({ error: 'admin_overview_unavailable' });
    }
  });
  app.get('/api/admin/leads', async (req, res) => {
    try {
      const auth = await getCurrentAdmin(req);
      if (!auth) return res.status(401).json({ error: 'authentication_required' });
      if (!auth.permissions.includes('*') && !auth.permissions.includes('leads.read') && !auth.permissions.includes('sales.read')) {
        return res.status(403).json({ error: 'permission_denied' });
      }
      const leads = await database.listAdminLeads(auth.user.organization_id, 50);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ ok: true, leads });
    } catch (error) {
      if (error.code === 'ADMIN_LEADS_SCHEMA_MISMATCH') return res.status(503).json({ error: 'admin_leads_not_ready', message: 'بيانات الطلبات تحتاج إلى مراجعة توافق قاعدة البيانات.' });
      console.error('Admin leads read failed:', error.code || 'unknown');
      return res.status(503).json({ error: 'admin_leads_unavailable' });
    }
  });
  app.get('/api/admin/catalog', async (req, res) => {
    try {
      const auth = await getCurrentAdmin(req);
      if (!auth) return res.status(401).json({ error: 'authentication_required' });
      if (!auth.permissions.includes('*') && !auth.permissions.includes('catalog.read') && !auth.permissions.includes('catalog.manage')) {
        return res.status(403).json({ error: 'permission_denied' });
      }
      const categories = await database.listAdminCatalog(auth.user.organization_id);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ ok: true, categories });
    } catch (error) {
      if (error.code === 'ADMIN_CATALOG_SCHEMA_MISMATCH') return res.status(503).json({ error: 'admin_catalog_not_ready', message: 'كتالوج الإدارة يحتاج إلى مراجعة توافق قاعدة البيانات.' });
      console.error('Admin catalog read failed:', error.code || 'unknown');
      return res.status(503).json({ error: 'admin_catalog_unavailable' });
    }
  });
  app.get('/api/public/catalog', async (_req, res) => {
    try {
      const categories = await database.listPublicCatalog();
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
      if (!categories.length) {
        return res.status(200).json({
          ok: true,
          provisional: true,
          currencyNote: 'Starter estimates only. Amounts are in minor currency units and are not a final offer.',
          categories: defaultCatalog
        });
      }
      return res.status(200).json({ ok: true, provisional: false, currencyNote: 'All amounts are returned in minor currency units as stored in the organization catalog.', categories });
    } catch (error) {
      if (error.code === 'CATALOG_NOT_CONFIGURED') {
        res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
        return res.status(200).json({
          ok: true,
          provisional: true,
          currencyNote: 'Starter estimates only. Amounts are in minor currency units and are not a final offer.',
          categories: defaultCatalog
        });
      }
      if (error.code === 'CATALOG_SCHEMA_MISMATCH') {
        return res.status(503).json({ error: 'catalog_not_ready', message: 'كتالوج الأسعار يحتاج إلى مراجعة توافق قاعدة البيانات.' });
      }
      console.error('Public catalog read failed:', error.code || 'unknown');
      return res.status(503).json({ error: 'catalog_unavailable', message: 'تعذر تحميل قائمة الخدمات الآن.' });
    }
  });
  app.post('/api/public/inquiries', async (req, res) => {
    if (!config.intakeEnabled || !config.publicOrganizationId) {
      return res.status(503).json({
        error: 'intake_not_enabled',
        message: 'استقبال الطلبات غير مفعّل بعد. لم يتم حفظ أي طلب.'
      });
    }
    const body = req.body;
    const allowed = new Set(['name','email','phone','company','service','size','pages','languages','brand','features','hosting','goal','audience','integrations','deadline','constraints','consent']);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.has(key))) {
      return res.status(400).json({ error: 'invalid_request', message: 'بيانات الطلب غير صالحة.' });
    }
    const str = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
    if (!str(body.name, 160) || !str(body.email, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ||
        !str(body.service, 120) || !str(body.goal, 4000) || body.goal.trim().length < 20 ||
        (body.phone != null && (typeof body.phone !== 'string' || body.phone.length > 40)) ||
        (body.company != null && (typeof body.company !== 'string' || body.company.length > 200)) ||
        (body.features != null && (!Array.isArray(body.features) || body.features.length > 30 || body.features.some(v => typeof v !== 'string' || v.length > 160))) ||
        body.consent !== true) {
      return res.status(400).json({ error: 'validation_failed', message: 'أكمل البيانات المطلوبة ووافق على معالجة بيانات الطلب قبل الإرسال.' });
    }
    for (const key of ['size','pages','languages','brand','hosting','audience','integrations','deadline','constraints']) {
      if (body[key] != null && (typeof body[key] !== 'string' || body[key].length > 2000)) {
        return res.status(400).json({ error: 'validation_failed', message: 'أحد الحقول يتجاوز الحد المسموح.' });
      }
    }
    try {
      const inquiry = await database.createInquiry({
        name: body.name.trim(), email: body.email.trim(), phone: (body.phone || '').trim(),
        company: (body.company || '').trim(), service: body.service.trim(), size: body.size || '',
        pages: body.pages || '', languages: body.languages || '', brand: body.brand || '',
        features: body.features || [], hosting: body.hosting || '', goal: body.goal.trim(),
        audience: body.audience || '', integrations: body.integrations || '',
        deadline: body.deadline || '', constraints: body.constraints || ''
      });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(201).json({ ok: true, inquiry: { reference: inquiry.reference, status: inquiry.status, createdAt: inquiry.created_at }, message: 'تم استلام طلبك بنجاح.' });
    } catch (error) {
      if (error.code === 'INTAKE_NOT_ENABLED' || error.code === 'INTAKE_SCHEMA_MISMATCH') {
        return res.status(503).json({ error: 'intake_not_ready', message: 'لم يتم تفعيل استقبال الطلبات بعد مراجعة توافق قاعدة البيانات. لم يتم حفظ أي طلب.' });
      }
      console.error('Inquiry persistence failed:', error.code || 'unknown');
      return res.status(503).json({ error: 'inquiry_save_failed', message: 'تعذر حفظ الطلب الآن. لم يتم تسجيله؛ حاول لاحقًا.' });
    }
  });
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
+hash});
      res.setHeader('Cache-Control','no-store');return res.status(201).json({ok:true,member});
    }catch(error){
      if(error.code==='ADMIN_ROLE_NOT_FOUND')return res.status(400).json({error:'invalid_role'});
      if(error.code==='ADMIN_MEMBER_EMAIL_EXISTS')return res.status(409).json({error:'email_exists',message:'يوجد حساب بهذا البريد الإلكتروني بالفعل.'});
      console.error('Admin member create failed:',error.code||'unknown');return res.status(503).json({error:'admin_member_create_failed'});
    }
  });
  app.get('/api/admin/site-settings', async (req,res)=>{
    try{const auth=await getCurrentAdmin(req);if(!auth)return res.status(401).json({error:'authentication_required'});if(!auth.permissions.includes('*')&&!auth.permissions.includes('site.manage'))return res.status(403).json({error:'permission_denied'});
    const result=await database.getSiteSettings(auth.user.organization_id);res.setHeader('Cache-Control','no-store');return res.json({ok:true,settings:result.settings||{},updatedAt:result.updated_at||null});
    }catch(error){if(error.code==='SITE_SETTINGS_SCHEMA_MISMATCH')return res.status(503).json({error:'site_settings_not_ready',message:'يلزم تطبيق ترحيل إعدادات الموقع.'});console.error('Admin site settings read failed:',error.code||'unknown');return res.status(503).json({error:'site_settings_unavailable'});}
  });
  app.put('/api/admin/site-settings', async (req,res)=>{
    const csrfCookie=readCookie(req.headers.cookie,'atsh_admin_csrf');if(!csrfCookie||!safeEqual(csrfCookie,req.get('x-csrf-token')||''))return res.status(403).json({error:'csrf_validation_failed'});
    try{const auth=await getCurrentAdmin(req);if(!auth)return res.status(401).json({error:'authentication_required'});if(!auth.permissions.includes('*')&&!auth.permissions.includes('site.manage'))return res.status(403).json({error:'permission_denied'});
    const input=req.body?.settings;const allowed=['hero_title','hero_description','logo_url','hero_background_url','primary_color','accent_color','contact_email','page_content'];
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.includes(key)))return res.status(400).json({error:'invalid_settings'});
    const limits={hero_title:180,hero_description:1000,logo_url:1000,hero_background_url:1000,primary_color:7,accent_color:7,contact_email:254};const settings={};
    for(const key of Object.keys(limits)){if(!(key in input))continue;const value=input[key]==null?'':input[key];if(typeof value!=='string'||value.length>limits[key])return res.status(400).json({error:'invalid_settings'});settings[key]=value.trim();}
    if(input.page_content!==undefined){
      if(!input.page_content||typeof input.page_content!=='object'||Array.isArray(input.page_content)||Object.keys(input.page_content).some(key=>!['home','services','pricing','process','about','faq'].includes(key)))return res.status(400).json({error:'invalid_page_content'});
      settings.page_content={};
      for(const [page,fields] of Object.entries(input.page_content)){
        if(!fields||typeof fields!=='object'||Array.isArray(fields)||Object.keys(fields).some(key=>!['title','description'].includes(key)))return res.status(400).json({error:'invalid_page_content'});
        const item={};for(const field of ['title','description']){const value=fields[field]===undefined?'':fields[field];if(typeof value!=='string'||value.length>(field==='title'?180:1000))return res.status(400).json({error:'invalid_page_content'});item[field]=value.trim();}
        settings.page_content[page]=item;
      }
    }
    for(const key of ['primary_color','accent_color'])if(settings[key]&&!/^#[0-9a-f]{6}$/i.test(settings[key]))return res.status(400).json({error:'invalid_settings',message:'صيغة اللون غير صحيحة.'});
    if(settings.logo_url&&!/^https:\/\//i.test(settings.logo_url))return res.status(400).json({error:'invalid_settings',message:'رابط الشعار يجب أن يبدأ بـ https.'});
    if(settings.hero_background_url&& !(/^https:\/\//i.test(settings.hero_background_url)||(/^\/(?!\/)[A-Za-z0-9_./-]+$/.test(settings.hero_background_url)&&!settings.hero_background_url.split('/').includes('..'))))return res.status(400).json({error:'invalid_settings',message:'استخدم رابط HTTPS أو مسارًا محليًا يبدأ بشرطة واحدة.'});
    if(settings.contact_email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.contact_email))return res.status(400).json({error:'invalid_settings',message:'البريد الإلكتروني غير صحيح.'});
    const previous=await database.getSiteSettings(auth.user.organization_id);
    const merged={...(previous.settings||{}),...settings,page_content:{...((previous.settings||{}).page_content||{}),...(settings.page_content||{})}};
    const saved=await database.saveSiteSettings(auth.user.organization_id,auth.user.id,merged);res.setHeader('Cache-Control','no-store');return res.json({ok:true,settings:saved.settings,updatedAt:saved.updated_at});
    }catch(error){if(error.code==='SITE_SETTINGS_SCHEMA_MISMATCH')return res.status(503).json({error:'site_settings_not_ready',message:'يلزم تطبيق ترحيل إعدادات الموقع.'});console.error('Admin site settings save failed:',error.code||'unknown');return res.status(503).json({error:'site_settings_unavailable',message:'تعذر حفظ إعدادات الموقع.'});}
  });
  app.get('/api/public/site-settings',async(_req,res)=>{
    try{if(!config.publicOrganizationId)return res.json({ok:true,settings:{}});const result=await database.getSiteSettings(config.publicOrganizationId);res.setHeader('Cache-Control','public,max-age=30,stale-while-revalidate=60');return res.json({ok:true,settings:result.settings||{}});}
    catch(error){if(error.code==='SITE_SETTINGS_SCHEMA_MISMATCH')return res.status(200).json({ok:true,settings:{}});console.error('Public site settings read failed:',error.code||'unknown');return res.status(200).json({ok:true,settings:{}});}
  });
  app.get('/api/admin/overview', async (req, res) => {
    try {
      const auth = await getCurrentAdmin(req);
      if (!auth) return res.status(401).json({ error: 'authentication_required' });
      if (!auth.permissions.includes('*') && !auth.permissions.includes('dashboard.read') && !auth.permissions.includes('reports.read')) {
        return res.status(403).json({ error: 'permission_denied' });
      }
      const overview = await database.getAdminOverview(auth.user.organization_id);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ ok: true, overview });
    } catch (error) {
      if (error.code === 'ADMIN_OVERVIEW_SCHEMA_MISMATCH') return res.status(503).json({ error: 'admin_overview_not_ready', message: 'بعض جداول لوحة الإدارة تحتاج إلى مراجعة توافق.' });
      console.error('Admin overview failed:', error.code || 'unknown');
      return res.status(503).json({ error: 'admin_overview_unavailable' });
    }
  });
  app.get('/api/admin/leads', async (req, res) => {
    try {
      const auth = await getCurrentAdmin(req);
      if (!auth) return res.status(401).json({ error: 'authentication_required' });
      if (!auth.permissions.includes('*') && !auth.permissions.includes('leads.read') && !auth.permissions.includes('sales.read')) {
        return res.status(403).json({ error: 'permission_denied' });
      }
      const leads = await database.listAdminLeads(auth.user.organization_id, 50);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ ok: true, leads });
    } catch (error) {
      if (error.code === 'ADMIN_LEADS_SCHEMA_MISMATCH') return res.status(503).json({ error: 'admin_leads_not_ready', message: 'بيانات الطلبات تحتاج إلى مراجعة توافق قاعدة البيانات.' });
      console.error('Admin leads read failed:', error.code || 'unknown');
      return res.status(503).json({ error: 'admin_leads_unavailable' });
    }
  });
  app.get('/api/admin/catalog', async (req, res) => {
    try {
      const auth = await getCurrentAdmin(req);
      if (!auth) return res.status(401).json({ error: 'authentication_required' });
      if (!auth.permissions.includes('*') && !auth.permissions.includes('catalog.read') && !auth.permissions.includes('catalog.manage')) {
        return res.status(403).json({ error: 'permission_denied' });
      }
      const categories = await database.listAdminCatalog(auth.user.organization_id);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ ok: true, categories });
    } catch (error) {
      if (error.code === 'ADMIN_CATALOG_SCHEMA_MISMATCH') return res.status(503).json({ error: 'admin_catalog_not_ready', message: 'كتالوج الإدارة يحتاج إلى مراجعة توافق قاعدة البيانات.' });
      console.error('Admin catalog read failed:', error.code || 'unknown');
      return res.status(503).json({ error: 'admin_catalog_unavailable' });
    }
  });
  app.get('/api/public/catalog', async (_req, res) => {
    try {
      const categories = await database.listPublicCatalog();
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
      if (!categories.length) {
        return res.status(200).json({
          ok: true,
          provisional: true,
          currencyNote: 'Starter estimates only. Amounts are in minor currency units and are not a final offer.',
          categories: defaultCatalog
        });
      }
      return res.status(200).json({ ok: true, provisional: false, currencyNote: 'All amounts are returned in minor currency units as stored in the organization catalog.', categories });
    } catch (error) {
      if (error.code === 'CATALOG_NOT_CONFIGURED') {
        res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
        return res.status(200).json({
          ok: true,
          provisional: true,
          currencyNote: 'Starter estimates only. Amounts are in minor currency units and are not a final offer.',
          categories: defaultCatalog
        });
      }
      if (error.code === 'CATALOG_SCHEMA_MISMATCH') {
        return res.status(503).json({ error: 'catalog_not_ready', message: 'كتالوج الأسعار يحتاج إلى مراجعة توافق قاعدة البيانات.' });
      }
      console.error('Public catalog read failed:', error.code || 'unknown');
      return res.status(503).json({ error: 'catalog_unavailable', message: 'تعذر تحميل قائمة الخدمات الآن.' });
    }
  });
  app.post('/api/public/inquiries', async (req, res) => {
    if (!config.intakeEnabled || !config.publicOrganizationId) {
      return res.status(503).json({
        error: 'intake_not_enabled',
        message: 'استقبال الطلبات غير مفعّل بعد. لم يتم حفظ أي طلب.'
      });
    }
    const body = req.body;
    const allowed = new Set(['name','email','phone','company','service','size','pages','languages','brand','features','hosting','goal','audience','integrations','deadline','constraints','consent']);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.has(key))) {
      return res.status(400).json({ error: 'invalid_request', message: 'بيانات الطلب غير صالحة.' });
    }
    const str = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
    if (!str(body.name, 160) || !str(body.email, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ||
        !str(body.service, 120) || !str(body.goal, 4000) || body.goal.trim().length < 20 ||
        (body.phone != null && (typeof body.phone !== 'string' || body.phone.length > 40)) ||
        (body.company != null && (typeof body.company !== 'string' || body.company.length > 200)) ||
        (body.features != null && (!Array.isArray(body.features) || body.features.length > 30 || body.features.some(v => typeof v !== 'string' || v.length > 160))) ||
        body.consent !== true) {
      return res.status(400).json({ error: 'validation_failed', message: 'أكمل البيانات المطلوبة ووافق على معالجة بيانات الطلب قبل الإرسال.' });
    }
    for (const key of ['size','pages','languages','brand','hosting','audience','integrations','deadline','constraints']) {
      if (body[key] != null && (typeof body[key] !== 'string' || body[key].length > 2000)) {
        return res.status(400).json({ error: 'validation_failed', message: 'أحد الحقول يتجاوز الحد المسموح.' });
      }
    }
    try {
      const inquiry = await database.createInquiry({
        name: body.name.trim(), email: body.email.trim(), phone: (body.phone || '').trim(),
        company: (body.company || '').trim(), service: body.service.trim(), size: body.size || '',
        pages: body.pages || '', languages: body.languages || '', brand: body.brand || '',
        features: body.features || [], hosting: body.hosting || '', goal: body.goal.trim(),
        audience: body.audience || '', integrations: body.integrations || '',
        deadline: body.deadline || '', constraints: body.constraints || ''
      });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(201).json({ ok: true, inquiry: { reference: inquiry.reference, status: inquiry.status, createdAt: inquiry.created_at }, message: 'تم استلام طلبك بنجاح.' });
    } catch (error) {
      if (error.code === 'INTAKE_NOT_ENABLED' || error.code === 'INTAKE_SCHEMA_MISMATCH') {
        return res.status(503).json({ error: 'intake_not_ready', message: 'لم يتم تفعيل استقبال الطلبات بعد مراجعة توافق قاعدة البيانات. لم يتم حفظ أي طلب.' });
      }
      console.error('Inquiry persistence failed:', error.code || 'unknown');
      return res.status(503).json({ error: 'inquiry_save_failed', message: 'تعذر حفظ الطلب الآن. لم يتم تسجيله؛ حاول لاحقًا.' });
    }
  });
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
