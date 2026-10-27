'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = process.env.DATA_DIR || (process.env.WEBSITE_INSTANCE_ID ? '/home/data' : path.join(__dirname, '.data'));
const DB_FILE = path.join(DATA_DIR, 'admin-store.json');
const COOKIE = 'atsh_admin';
const CODE_TTL = 10 * 60 * 1000;
const SESSION_TTL = 8 * 60 * 60 * 1000;
const MAX_UPLOAD = 4 * 1024 * 1024;
const validRoles = new Set(['Administrator', 'Manager', 'Staff', 'Assistant', 'Read-only']);
const allPermissions = ['content.read','content.write','team.read','team.invite','team.manage','tasks.read','tasks.assign','tasks.update_own','inquiries.read','audit.read','settings.manage'];
const rolePermissions = {
  Owner: ['*'],
  Administrator: ['content.read','content.write','team.read','team.invite','team.manage','tasks.read','tasks.assign','tasks.update_own','inquiries.read','audit.read'],
  Manager: ['content.read','team.read','tasks.read','tasks.assign','tasks.update_own'],
  Staff: ['tasks.read','tasks.update_own'],
  Assistant: ['content.read','tasks.read','tasks.update_own'],
  'Read-only': ['content.read','tasks.read']
};
let queue = Promise.resolve();
const attempts = new Map();

function defaultPricing() {
  return {
    currency: 'EGP',
    notice: 'الأسعار التقديرية قابلة للمراجعة حسب نطاق المشروع، ولا يُعد الطلب عقدًا ملزمًا.',
    categories: [
      { id: 'website', name: 'تصميم المواقع', active: true, plans: [
        { id: 'starter', name: 'انطلاقة', description: 'موقع تعريفي للشركات الصغيرة', setup: 8500, monthly: 0, annual: 0, features: ['حتى 5 صفحات','تصميم متجاوب','نموذج تواصل','تهيئة SEO أساسية'], popular: false },
        { id: 'business', name: 'أعمال', description: 'حضور رقمي احترافي قابل للتوسع', setup: 16000, monthly: 0, annual: 0, features: ['حتى 10 صفحات','إدارة محتوى','ربط التحليلات','تهيئة SEO محسّنة'], popular: true },
        { id: 'growth', name: 'نمو', description: 'موقع متقدم وتكاملات مخصصة', setup: 28000, monthly: 0, annual: 0, features: ['حتى 20 صفحة','تكاملات API','نماذج متقدمة','دعم إطلاق'], popular: false }
      ]},
      { id: 'hosting', name: 'الاستضافة', active: true, plans: [
        { id: 'hosting-basic', name: 'استضافة أساسية', description: 'للمواقع التعريفية', setup: 0, monthly: 250, annual: 2700, features: ['SSL','نسخ احتياطي دوري','مراقبة التوفر'], popular: false },
        { id: 'hosting-pro', name: 'استضافة احترافية', description: 'للمواقع النشطة', setup: 0, monthly: 550, annual: 5940, features: ['موارد أعلى','نسخ احتياطي متكرر','أولوية الدعم'], popular: true }
      ]},
      { id: 'care', name: 'الصيانة والدعم', active: true, plans: [
        { id: 'care-monthly', name: 'رعاية شهرية', description: 'تحديثات ومتابعة فنية', setup: 0, monthly: 900, annual: 9720, features: ['تحديثات دورية','متابعة الأعطال','تقرير شهري'], popular: false }
      ]}
    ],
    addons: [
      { id: 'domain', name: 'تسجيل دومين', description: 'حسب الامتداد والتجديد', setup: 700, monthly: 0, annual: 700, active: true },
      { id: 'business-email', name: 'بريد أعمال', description: 'لكل صندوق بريد سنويًا', setup: 0, monthly: 0, annual: 1200, active: true },
      { id: 'backup', name: 'نسخ احتياطي موسّع', description: 'نسخ احتياطي واستعادة', setup: 0, monthly: 150, annual: 1620, active: true },
      { id: 'ai-assistant', name: 'مساعد ذكاء اصطناعي', description: 'التكامل والاستخدام يحددان السعر النهائي', setup: 5000, monthly: 1200, annual: 12960, active: true }
    ],
    updatedAt: new Date().toISOString()
  };
}
function cleanPricing(data) {
  if (!data || !Array.isArray(data.categories) || !Array.isArray(data.addons)) throw new Error('صيغة التسعير غير صالحة.');
  const money = v => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100000000 ? Math.round(Number(v)) : null;
  const text = (v, n=120) => clean(v,n);
  const ids = new Set();
  const categories = data.categories.slice(0,30).map(c => {
    const id=text(c.id,60); if(!id || ids.has(id)) throw new Error('معرّفات فئات التسعير يجب أن تكون فريدة.'); ids.add(id);
    if(!Array.isArray(c.plans)) throw new Error('كل فئة يجب أن تحتوي على قائمة باقات.');
    const planIds=new Set();
    const plans=c.plans.slice(0,50).map(p=>{
      const pid=text(p.id,60); if(!pid||planIds.has(pid)) throw new Error('معرّفات الباقات يجب أن تكون فريدة داخل الفئة.'); planIds.add(pid);
      const setup=money(p.setup), monthly=money(p.monthly), annual=money(p.annual);
      if(setup===null||monthly===null||annual===null) throw new Error('الأسعار يجب أن تكون أرقامًا غير سالبة.');
      return {id:pid,name:text(p.name),description:text(p.description,300),setup,monthly,annual,features:Array.isArray(p.features)?p.features.slice(0,20).map(v=>text(v,200)).filter(Boolean):[],popular:p.popular===true};
    });
    return {id,name:text(c.name),active:c.active!==false,plans};
  });
  const addonIds=new Set();
  const addons=data.addons.slice(0,100).map(a=>{
    const id=text(a.id,60); if(!id||addonIds.has(id)) throw new Error('معرّفات الإضافات يجب أن تكون فريدة.'); addonIds.add(id);
    const setup=money(a.setup),monthly=money(a.monthly),annual=money(a.annual);
    if(setup===null||monthly===null||annual===null) throw new Error('أسعار الإضافات يجب أن تكون أرقامًا غير سالبة.');
    return {id,name:text(a.name),description:text(a.description,300),setup,monthly,annual,active:a.active!==false};
  });
  return {currency:'EGP',notice:text(data.notice,500),categories,addons,updatedAt:new Date().toISOString()};
}
function now() { return Date.now(); }
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function clean(value, max = 500) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254; }
function defaultStore() {
  return {
    version: 1, owner: null, users: [], sessions: [], challenges: [], invitations: [],
    tasks: [], quotes: [], pricing: null, audit: [], content: { version: 1, theme: { primary: '#36c6bd', accent: '#a99aff', background: '#0b1020', surface: '#182338', text: '#f4f7fb', muted: '#aab7ca', cardBorder: '#334155', fontAr: 'IBM Plex Sans Arabic', cardRadius: '18px' }, pages: [], blocks: [] }
  };
}
async function readStore() {
  await fs.promises.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  try {
    const data = JSON.parse(await fs.promises.readFile(DB_FILE, 'utf8'));
    const base = defaultStore();
    return { ...base, ...data, pricing: data.pricing || defaultPricing(), quotes: Array.isArray(data.quotes) ? data.quotes : [], content: { ...base.content, ...(data.content || {}) } };
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    const fresh = defaultStore(); fresh.pricing = defaultPricing(); return fresh;
  }
}
async function writeStore(store) {
  await fs.promises.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  const tmp = DB_FILE + '.' + crypto.randomUUID() + '.tmp';
  await fs.promises.writeFile(tmp, JSON.stringify(store), { mode: 0o600 });
  await fs.promises.rename(tmp, DB_FILE);
}
function transact(fn) {
  const run = queue.then(async () => {
    const store = await readStore();
    const result = await fn(store);
    await writeStore(store);
    return result;
  });
  queue = run.catch(() => {});
  return run;
}
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function json(res, status, body, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(JSON.stringify(body));
}
function readBody(req, limit = 32 * 1024) {
  return new Promise((resolve, reject) => {
    let chunks = [], length = 0;
    req.on('data', chunk => {
      length += chunk.length;
      if (length > limit) { reject(Object.assign(new Error('Request too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
function limiter(key, maximum = 8, windowMs = 15 * 60 * 1000) {
  const t = now();
  let a = attempts.get(key);
  if (!a || t - a.start > windowMs) a = { start: t, count: 0 };
  a.count++;
  attempts.set(key, a);
  return a.count <= maximum;
}
function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (e, key) => e ? reject(e) : resolve({ salt, hash: key.toString('hex') })));
}
async function verifyPassword(password, record) {
  if (!record?.salt || !record?.hash) return false;
  const result = await passwordHash(password, record.salt);
  return safeEqual(result.hash, record.hash);
}
function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active, permissions: Array.isArray(user.permissions) ? user.permissions : null, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt };
}
function hasPermission(user, permission) {
  if (!user || !user.active) return false;
  const list = Array.isArray(user.permissions) ? user.permissions : (rolePermissions[user.role] || []);
  return list.includes('*') || list.includes(permission);
}
function audit(store, actor, action, target, detail = {}) {
  store.audit.unshift({ id: crypto.randomUUID(), actorId: actor?.id || 'system', actorEmail: actor?.email || 'system', action, target, detail, at: new Date().toISOString() });
  store.audit = store.audit.slice(0, 1000);
}
async function sendEmail(to, subject, html) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from || !process.env.ADMIN_EMAIL) throw new Error('Email activation is not configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }), signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('Email provider rejected the message');
}
function codeHash(code, purpose, email) { return hash(purpose + ':' + email.toLowerCase() + ':' + code); }
async function newSession(store, user) {
  const token = crypto.randomBytes(32).toString('base64url');
  const csrf = crypto.randomBytes(24).toString('base64url');
  store.sessions = store.sessions.filter(s => s.userId !== user.id && s.expiresAt > now());
  store.sessions.push({ id: hash(token), csrf, userId: user.id, expiresAt: now() + SESSION_TTL, createdAt: now() });
  user.lastLoginAt = new Date().toISOString();
  return { token, csrf };
}
function cookieHeader(token, clear = false) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return COOKIE + '=' + (clear ? '' : encodeURIComponent(token)) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + (clear ? '0' : Math.floor(SESSION_TTL / 1000)) + secure;
}
async function authenticate(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  const store = await readStore();
  const session = store.sessions.find(s => s.id === hash(token) && s.expiresAt > now());
  if (!session) return null;
  const user = store.users.find(u => u.id === session.userId && u.active) || (store.owner?.id === session.userId ? store.owner : null);
  if (!user || (req.method !== 'GET' && req.method !== 'HEAD' && !safeEqual(req.headers['x-csrf-token'], session.csrf))) return null;
  return { user, session };
}
function slug(value) {
  return clean(value, 90).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\u0600-\u06ff]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}
function safeDetail(value, depth = 0) {
  if (depth > 5) return null;
  if (Array.isArray(value)) return value.slice(0, 100).map(v => safeDetail(v, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value).slice(0, 100)) {
      if (/password|secret|token|session|credential/i.test(k)) continue;
      out[clean(k, 80)] = safeDetail(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string') return value.slice(0, 5000);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  return null;
}

async function handler(req, res, url) {
  const p = url.pathname;
  if (req.method === 'GET' && p === '/api/pricing') {
    const store = await readStore();
    return json(res, 200, { pricing: store.pricing || defaultPricing() });
  }
  if (req.method === 'POST' && p === '/api/quotes') {
    let data; try { data = await readBody(req, 64 * 1024); } catch (e) { return json(res, e.status || 400, { error: 'بيانات الطلب غير صالحة.' }); }
    const store = await readStore(), pricing = store.pricing || defaultPricing();
    const category = pricing.categories.find(c => c.active && c.id === clean(data.categoryId,60));
    const plan = category?.plans.find(v => v.id === clean(data.planId,60));
    if (!category || !plan) return json(res, 400, { error: 'الباقة المختارة غير متاحة.' });
    const addonIds = Array.isArray(data.addonIds) ? [...new Set(data.addonIds.map(v=>clean(v,60)))].slice(0,30) : [];
    const addons = addonIds.map(id => pricing.addons.find(a => a.active && a.id === id)).filter(Boolean);
    if (addons.length !== addonIds.length) return json(res, 400, { error: 'تتضمن الإضافات اختيارًا غير متاح.' });
    const name=clean(data.name,120), email=clean(data.email,254), phone=clean(data.phone,40), notes=clean(data.notes,2000);
    if(!name || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) return json(res,400,{error:'الاسم والبريد الإلكتروني الصحيح مطلوبان.'});
    const quote = { id: crypto.randomUUID(), reference: 'ATS-'+crypto.randomBytes(4).toString('hex').toUpperCase(), createdAt:new Date().toISOString(), status:'new', customer:{name,email,phone}, category:{id:category.id,name:category.name}, plan:{id:plan.id,name:plan.name,setup:plan.setup,monthly:plan.monthly,annual:plan.annual}, addons:addons.map(a=>({id:a.id,name:a.name,setup:a.setup,monthly:a.monthly,annual:a.annual})), notes, totals:{setup:plan.setup+addons.reduce((n,a)=>n+a.setup,0),monthly:plan.monthly+addons.reduce((n,a)=>n+a.monthly,0),annual:plan.annual+addons.reduce((n,a)=>n+a.annual,0)}, pricingUpdatedAt:pricing.updatedAt };
    await transact(s=>{s.quotes.unshift(quote);s.quotes=s.quotes.slice(0,2000);});
    return json(res,201,{ok:true,reference:quote.reference,quote:{reference:quote.reference,totals:quote.totals}});
  }
  if (req.method === 'GET' && p === '/api/site-content') {
    const store = await readStore();
    return json(res, 200, store.content);
  }
  if (req.method === 'GET' && p.startsWith('/media/')) {
    const name = path.basename(p.slice('/media/'.length));
    if (!/^[a-f0-9-]{36}\.(png|jpg|jpeg|webp|gif)$/.test(name)) return json(res, 404, { error: 'Not found' });
    try {
      const file = await fs.promises.readFile(path.join(DATA_DIR, 'uploads', name));
      const ext = path.extname(name).slice(1).replace('jpg', 'jpeg');
      res.writeHead(200, { 'Content-Type': 'image/' + ext, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
      return res.end(file);
    } catch { return json(res, 404, { error: 'Not found' }); }
  }

  if (req.method === 'POST' && p === '/api/admin/bootstrap/request') {
    const email = clean(process.env.ADMIN_EMAIL, 254).toLowerCase();
    if (!validEmail(email) || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return json(res, 503, { error: 'لم يتم إعداد بريد المالك ومزوّد الرسائل في إعدادات Azure بعد.' });
    if (!limiter('bootstrap:' + (req.socket.remoteAddress || 'unknown'), 3)) return json(res, 429, { error: 'محاولات كثيرة. حاول لاحقًا.' });
    const store = await readStore();
    if (store.owner) return json(res, 409, { error: 'تم تفعيل حساب المالك بالفعل. استخدم تسجيل الدخول أو الاستعادة.' });
    const code = String(crypto.randomInt(10000000, 99999999));
    await transact(s => {
      s.challenges = s.challenges.filter(c => c.email !== email || c.purpose !== 'bootstrap');
      s.challenges.push({ email, purpose: 'bootstrap', codeHash: codeHash(code, 'bootstrap', email), expiresAt: now() + CODE_TTL, attempts: 0 });
    });
    try {
      await sendEmail(email, 'تفعيل حساب مالك atsh-ai', '<div dir="rtl" style="font-family:Arial,sans-serif"><h2>تفعيل حساب إدارة atsh-ai</h2><p>رمز التفعيل لمرة واحدة:</p><p style="font-size:28px;font-weight:bold;letter-spacing:5px">' + code + '</p><p>تنتهي صلاحية الرمز خلال 10 دقائق. إذا لم تطلبه فتجاهل الرسالة.</p></div>');
      return json(res, 202, { ok: true, message: 'أُرسل رمز التفعيل إلى بريد المالك المُعد في إعدادات الخادم.' });
    } catch { return json(res, 503, { error: 'تعذر إرسال رسالة التفعيل. تحقق من إعدادات مزوّد البريد.' }); }
  }

  if (req.method === 'POST' && p === '/api/admin/bootstrap/verify') {
    let data; try { data = await readBody(req); } catch (e) { return json(res, e.status || 400, { error: 'طلب غير صالح' }); }
    const email = clean(process.env.ADMIN_EMAIL, 254).toLowerCase();
    const code = clean(data.code, 12);
    const password = typeof data.password === 'string' ? data.password : '';
    if (password.length < 12 || password.length > 200) return json(res, 400, { error: 'كلمة المرور يجب أن تكون 12 حرفًا على الأقل.' });
    const outcome = await transact(async store => {
      if (store.owner) return { error: 'تم إنشاء حساب المالك بالفعل.' };
      const ch = store.challenges.find(c => c.email === email && c.purpose === 'bootstrap' && c.expiresAt > now());
      if (!ch || ch.attempts >= 5 || !safeEqual(ch.codeHash, codeHash(code, 'bootstrap', email))) {
        if (ch) ch.attempts++;
        return { error: 'رمز غير صحيح أو منتهي الصلاحية.' };
      }
      const ph = await passwordHash(password);
      const user = { id: crypto.randomUUID(), name: 'مالك atsh-ai', email, role: 'Owner', active: true, password: ph, createdAt: new Date().toISOString(), lastLoginAt: null };
      store.owner = user; store.users = [];
      store.challenges = store.challenges.filter(c => !(c.email === email && c.purpose === 'bootstrap'));
      audit(store, user, 'owner.bootstrap', user.id);
      const session = await newSession(store, user);
      return { user: publicUser(user), session };
    });
    if (outcome.error) return json(res, 400, { error: outcome.error });
    return json(res, 201, { user: outcome.user, csrfToken: outcome.session.csrf }, { 'Set-Cookie': cookieHeader(outcome.session.token) });
  }

  if (req.method === 'POST' && p === '/api/admin/login') {
    let data; try { data = await readBody(req); } catch (e) { return json(res, e.status || 400, { error: 'طلب غير صالح' }); }
    const email = clean(data.email, 254).toLowerCase();
    if (!limiter('login:' + email + ':' + (req.socket.remoteAddress || ''), 8)) return json(res, 429, { error: 'محاولات كثيرة. حاول لاحقًا.' });
    const store = await readStore();
    const user = store.owner?.email === email ? store.owner : store.users.find(u => u.email === email);
    if (!user || !user.active || !(await verifyPassword(String(data.password || ''), user.password))) return json(res, 401, { error: 'البريد أو كلمة المرور غير صحيحة.' });
    const session = await transact(async s => {
      const current = s.owner?.id === user.id ? s.owner : s.users.find(u => u.id === user.id);
      if (!current || !current.active) return null;
      const result = await newSession(s, current);
      audit(s, current, 'auth.login', current.id);
      return { ...result, user: publicUser(current) };
    });
    if (!session) return json(res, 401, { error: 'الحساب غير نشط.' });
    return json(res, 200, { user: session.user, csrfToken: session.csrf }, { 'Set-Cookie': cookieHeader(session.token) });
  }

  if (req.method === 'POST' && p === '/api/admin/logout') {
    const auth = await authenticate(req);
    if (!auth) return json(res, 401, { error: 'انتهت الجلسة أو فشل التحقق الأمني.' }, { 'Set-Cookie': cookieHeader('', true) });
    const token = parseCookies(req)[COOKIE];
    await transact(store => {
      store.sessions = store.sessions.filter(s => s.id !== hash(token || ''));
      audit(store, auth.user, 'auth.logout', auth.user.id);
    });
    return json(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader('', true) });
  }

  if (p === '/api/admin/me' && req.method === 'GET') {
    const auth = await authenticate(req);
    if (!auth) return json(res, 401, { error: 'يلزم تسجيل الدخول.' });
    const store = await readStore();
    return json(res, 200, { user: publicUser(auth.user), csrfToken: auth.session.csrf, permissions: rolePermissions[auth.user.role] || [] });
  }

  if (p === '/api/admin/team/activate' && req.method === 'POST') {
    let data; try { data = await readBody(req); } catch (e) { return json(res, e.status || 400, { error: 'بيانات غير صالحة.' }); }
    const token = clean(data.token, 200), password = typeof data.password === 'string' ? data.password : '';
    if (password.length < 12 || password.length > 200) return json(res, 400, { error: 'كلمة المرور يجب أن تكون 12 حرفًا على الأقل.' });
    const result = await transact(async s => {
      const inv = s.invitations.find(i => i.expiresAt > now() && safeEqual(i.tokenHash, hash(token)));
      if (!inv) return { error: 'رابط الدعوة غير صالح أو منتهي.' };
      if (s.users.some(u => u.email === inv.email) || s.owner?.email === inv.email) return { error: 'الحساب مسجل بالفعل.' };
      const ph = await passwordHash(password);
      const user = { id: crypto.randomUUID(), name: inv.name, email: inv.email, role: inv.role, active: true, password: ph, createdAt: new Date().toISOString(), lastLoginAt: null };
      s.users.push(user); s.invitations = s.invitations.filter(i => i.id !== inv.id); audit(s, user, 'team.activate', user.id, { role: user.role });
      return { user: publicUser(user) };
    });
    return result.error ? json(res, 400, { error: result.error }) : json(res, 201, { ok: true, message: 'تم تفعيل الحساب. يمكنك تسجيل الدخول الآن.', user: result.user });
  }

  if (!p.startsWith('/api/admin/')) return false;
  const auth = await authenticate(req);
  if (!auth) return json(res, 401, { error: 'يلزم تسجيل الدخول أو انتهت الجلسة.' });
  const actor = auth.user;
  let store = await readStore();

  if (p === '/api/admin/pricing' && req.method === 'GET') {
    if (!hasPermission(actor, 'settings.manage')) return json(res,403,{error:'ليس لديك صلاحية إدارة التسعير.'});
    return json(res,200,{pricing:store.pricing || defaultPricing(),quotes:store.quotes.slice(0,200)});
  }
  if (p === '/api/admin/pricing' && req.method === 'PUT') {
    if (!hasPermission(actor, 'settings.manage')) return json(res,403,{error:'ليس لديك صلاحية إدارة التسعير.'});
    let data; try { data=await readBody(req,512*1024); } catch(e) { return json(res,e.status||400,{error:'بيانات التسعير غير صالحة.'}); }
    let pricing; try { pricing=cleanPricing(data.pricing); } catch(e) { return json(res,400,{error:e.message||'صيغة التسعير غير صالحة.'}); }
    await transact(s=>{s.pricing=pricing;audit(s,actor,'pricing.update','pricing',{categories:pricing.categories.length,addons:pricing.addons.length});});
    return json(res,200,{ok:true,updatedAt:pricing.updatedAt});
  }
  if (p.startsWith('/api/admin/quotes/') && req.method === 'PATCH') {
    if (!hasPermission(actor, 'inquiries.read')) return json(res,403,{error:'ليس لديك صلاحية متابعة الطلبات.'});
    const id=p.split('/').pop(); let data; try {data=await readBody(req);} catch(e){return json(res,e.status||400,{error:'بيانات غير صالحة.'});}
    const statuses=['new','contacted','quoted','won','lost'];
    const result=await transact(s=>{const q=s.quotes.find(v=>v.id===id);if(!q)return {error:'الطلب غير موجود.'};if(!statuses.includes(data.status))return {error:'حالة الطلب غير صالحة.'};q.status=data.status;q.updatedAt=new Date().toISOString();audit(s,actor,'quote.status',q.reference,{status:q.status});return {ok:true,quote:q};});
    return result.error?json(res,400,{error:result.error}):json(res,200,result);
  }
  if (p === '/api/admin/content' && req.method === 'GET') {
    if (!hasPermission(actor, 'content.read')) return json(res, 403, { error: 'ليس لديك صلاحية قراءة المحتوى.' });
    return json(res, 200, store.content);
  }
  if (p === '/api/admin/content' && req.method === 'PUT') {
    if (!hasPermission(actor, 'content.write')) return json(res, 403, { error: 'ليس لديك صلاحية تعديل المحتوى.' });
    let data; try { data = await readBody(req, 512 * 1024); } catch (e) { return json(res, e.status || 400, { error: 'بيانات غير صالحة.' }); }
    if (!data || !Array.isArray(data.pages) || !Array.isArray(data.blocks) || typeof data.theme !== 'object') return json(res, 400, { error: 'صيغة المحتوى غير صالحة.' });
    const content = safeDetail(data);
    for (const key of ['primary','accent','background','surface','text','muted','cardBorder']) {
      if (content.theme?.[key] && !/^#[0-9a-fA-F]{6}$/.test(content.theme[key])) return json(res, 400, { error: 'الألوان يجب أن تكون بصيغة HEX سداسية.' });
    }
    if (content.theme?.fontAr && !['IBM Plex Sans Arabic','Cairo','Tajawal','Noto Sans Arabic'].includes(content.theme.fontAr)) return json(res, 400, { error: 'الخط المحدد غير مسموح.' });
    if (content.theme?.cardRadius && !['12px','18px','24px'].includes(content.theme.cardRadius)) return json(res, 400, { error: 'استدارة البطاقة غير مسموحة.' });
    content.pages = content.pages.slice(0, 100).map(page => ({ id: clean(page.id, 80) || slug(page.title), title: clean(page.title, 160), path: '/' + slug(page.path || page.title), visible: page.visible !== false, language: page.language === 'en' ? 'en' : 'ar' }));
    content.blocks = content.blocks.slice(0, 300).map(block => ({ id: clean(block.id, 80) || crypto.randomUUID(), pageId: clean(block.pageId, 80) || 'home', type: ['text','card','image','heading'].includes(block.type) ? block.type : 'text', title: clean(block.title, 200), body: clean(block.body, 5000), image: /^\/media\/[a-f0-9-]{36}\.(png|jpg|jpeg|webp|gif)$/.test(block.image || '') ? block.image : '', color: /^#[0-9a-fA-F]{6}$/.test(block.color || '') ? block.color : '', visible: block.visible !== false }));
    content.version = (store.content.version || 0) + 1;
    await transact(s => { s.content = content; audit(s, actor, 'content.update', 'site-content', { version: content.version, pages: content.pages.length, blocks: content.blocks.length }); });
    return json(res, 200, { ok: true, version: content.version });
  }

  if (p === '/api/admin/team' && req.method === 'GET') {
    if (!hasPermission(actor, 'team.read')) return json(res, 403, { error: 'ليس لديك صلاحية عرض الفريق.' });
    return json(res, 200, { users: store.users.map(publicUser), roles: [...validRoles], permissions: allPermissions, roleDefaults: rolePermissions });
  }
  if (p === '/api/admin/team' && req.method === 'POST') {
    if (!hasPermission(actor, 'team.invite')) return json(res, 403, { error: 'ليس لديك صلاحية دعوة أعضاء.' });
    let data; try { data = await readBody(req); } catch (e) { return json(res, e.status || 400, { error: 'بيانات غير صالحة.' }); }
    const email = clean(data.email, 254).toLowerCase(), name = clean(data.name, 120), role = clean(data.role, 40);
    if (!validEmail(email) || !name || !validRoles.has(role)) return json(res, 400, { error: 'الاسم والبريد والدور مطلوبة.' });
    if (role === 'Administrator' && actor.role !== 'Owner') return json(res, 403, { error: 'منح دور المدير محصور بالمالك.' });
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !process.env.ADMIN_EMAIL) return json(res, 503, { error: 'خدمة البريد غير مهيأة.' });
    if (store.users.some(u => u.email === email) || store.owner?.email === email) return json(res, 409, { error: 'هذا البريد مسجل بالفعل.' });
    const token = crypto.randomBytes(32).toString('base64url');
    const invitation = { id: crypto.randomUUID(), email, name, role, tokenHash: hash(token), expiresAt: now() + 48 * 60 * 60 * 1000, createdBy: actor.id, createdAt: new Date().toISOString() };
    await transact(s => { s.invitations = s.invitations.filter(i => i.email !== email); s.invitations.push(invitation); audit(s, actor, 'team.invite', email, { role }); });
    const origin = process.env.PUBLIC_BASE_URL || 'https://' + (process.env.WEBSITE_HOSTNAME || 'localhost');
    try {
      await sendEmail(email, 'دعوة للانضمام إلى فريق atsh-ai', '<div dir="rtl" style="font-family:Arial,sans-serif"><h2>مرحبًا ' + name.replace(/[&<>"]/g, '') + '</h2><p>تمت دعوتك إلى فريق atsh-ai بصلاحية ' + role + '.</p><p><a href="' + origin + '/staff/activate?token=' + encodeURIComponent(token) + '">تفعيل الحساب وإنشاء كلمة المرور</a></p><p>ينتهي الرابط خلال 48 ساعة.</p></div>');
      return json(res, 201, { ok: true, message: 'أُرسلت دعوة التفعيل إلى البريد المحدد.' });
    } catch { return json(res, 503, { error: 'تعذر إرسال الدعوة؛ راجع إعدادات البريد.' }); }
  }


  if (p.startsWith('/api/admin/team/') && req.method === 'PATCH') {
    if (!hasPermission(actor, 'team.manage')) return json(res, 403, { error: 'ليس لديك صلاحية إدارة الحسابات.' });
    const id = p.split('/').pop();
    let data; try { data = await readBody(req); } catch (e) { return json(res, e.status || 400, { error: 'بيانات غير صالحة.' }); }
    const result = await transact(s => {
      const user = s.users.find(u => u.id === id);
      if (!user) return { error: 'الحساب غير موجود.' };
      if (data.role && !validRoles.has(data.role)) return { error: 'الدور غير صالح.' };
      if ((data.role === 'Administrator' || user.role === 'Administrator') && actor.role !== 'Owner') return { error: 'تعديل حسابات المديرين محصور بالمالك.' };
      if (data.role === 'Administrator' && actor.role !== 'Owner') return { error: 'منح دور المدير محصور بالمالك.' };
      if (Array.isArray(data.permissions)) {
        if (!['Owner','Administrator'].includes(actor.role)) return { error: 'تعديل الصلاحيات محصور بالمالك أو مدير مخوّل.' };
        if (actor.role !== 'Owner' && user.id === actor.id) return { error: 'لا يمكنك تعديل صلاحيات حسابك بنفسك.' };
        if (data.permissions.some(permission => !allPermissions.includes(permission) || (actor.role !== 'Owner' && !(rolePermissions[actor.role] || []).includes(permission)))) return { error: 'تتضمن الصلاحيات المطلوبة إذنًا غير مسموح لك بمنحه.' };
        user.permissions = [...new Set(data.permissions)];
      }
      if (data.active === false && user.role === 'Administrator' && s.users.filter(u => u.active && u.role === 'Administrator').length <= 1) return { error: 'لا يمكن تعطيل آخر حساب مدير نشط.' };
      if (data.name) user.name = clean(data.name, 120);
      if (data.role && data.role !== user.role) { user.role = data.role; user.permissions = null; }
      else if (data.role) user.role = data.role;
      if (typeof data.active === 'boolean') {
        if (!data.active) s.sessions = s.sessions.filter(sess => sess.userId !== user.id);
        user.active = data.active;
      }
      audit(s, actor, 'team.update', user.id, { role: user.role, active: user.active });
      return { user: publicUser(user) };
    });
    return result.error ? json(res, 400, { error: result.error }) : json(res, 200, result);
  }
  if (p.startsWith('/api/admin/team/') && req.method === 'DELETE') {
    if (actor.role !== 'Owner') return json(res, 403, { error: 'حذف الحسابات محصور بالمالك.' });
    const id = p.split('/').pop();
    const result = await transact(s => {
      const idx = s.users.findIndex(u => u.id === id);
      if (idx < 0) return { error: 'الحساب غير موجود.' };
      const [user] = s.users.splice(idx, 1);
      s.sessions = s.sessions.filter(sess => sess.userId !== user.id);
      audit(s, actor, 'team.delete', user.id, { email: user.email, role: user.role });
      return { ok: true };
    });
    return result.error ? json(res, 404, { error: result.error }) : json(res, 200, result);
  }

  if (p === '/api/admin/tasks' && req.method === 'GET') {
    if (!hasPermission(actor, 'tasks.read')) return json(res, 403, { error: 'ليس لديك صلاحية عرض المهام.' });
    return json(res, 200, { tasks: store.tasks.filter(t => actor.role === 'Owner' || actor.role === 'Administrator' || t.assigneeId === actor.id || hasPermission(actor, 'tasks.assign')) });
  }
  if (p === '/api/admin/tasks' && req.method === 'POST') {
    if (!hasPermission(actor, 'tasks.assign')) return json(res, 403, { error: 'ليس لديك صلاحية إسناد المهام.' });
    let data; try { data = await readBody(req); } catch (e) { return json(res, e.status || 400, { error: 'بيانات غير صالحة.' }); }
    const task = { id: crypto.randomUUID(), title: clean(data.title, 180), description: clean(data.description, 3000), priority: ['low','normal','high','urgent'].includes(data.priority) ? data.priority : 'normal', status: 'todo', assigneeId: clean(data.assigneeId, 80), createdBy: actor.id, dueDate: clean(data.dueDate, 30), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    if (!task.title) return json(res, 400, { error: 'عنوان المهمة مطلوب.' });
    if (task.assigneeId && !store.users.some(u => u.id === task.assigneeId && u.active)) return json(res, 400, { error: 'المكلّف غير نشط أو غير موجود.' });
    await transact(s => { s.tasks.unshift(task); audit(s, actor, 'task.create', task.id, { title: task.title, assigneeId: task.assigneeId }); });
    return json(res, 201, { task });
  }
  if (p.startsWith('/api/admin/tasks/') && req.method === 'PATCH') {
    if (!hasPermission(actor, 'tasks.update_own')) return json(res, 403, { error: 'ليس لديك صلاحية تحديث المهام.' });
    const id = p.split('/').pop();
    let data; try { data = await readBody(req); } catch (e) { return json(res, e.status || 400, { error: 'بيانات غير صالحة.' }); }
    const result = await transact(s => {
      const task = s.tasks.find(t => t.id === id);
      if (!task) return { error: 'المهمة غير موجودة.' };
      const manager = hasPermission(actor, 'tasks.assign');
      if (!manager && task.assigneeId !== actor.id) return { error: 'لا يمكنك تعديل مهمة غير مسندة إليك.' };
      if (data.title && manager) task.title = clean(data.title, 180);
      if (typeof data.description === 'string' && manager) task.description = clean(data.description, 3000);
      if (['todo','doing','blocked','done'].includes(data.status)) task.status = data.status;
      if (manager && typeof data.assigneeId === 'string') {
        if (data.assigneeId && !s.users.some(u => u.id === data.assigneeId && u.active)) return { error: 'المكلّف غير نشط أو غير موجود.' };
        task.assigneeId = data.assigneeId;
      }
      task.updatedAt = new Date().toISOString();
      audit(s, actor, 'task.update', task.id, { status: task.status, assigneeId: task.assigneeId });
      return { task };
    });
    return result.error ? json(res, 400, { error: result.error }) : json(res, 200, result);
  }

  if (p === '/api/admin/audit' && req.method === 'GET') {
    if (!hasPermission(actor, 'audit.read')) return json(res, 403, { error: 'ليس لديك صلاحية عرض سجل النشاط.' });
    return json(res, 200, { events: store.audit.slice(0, 200) });
  }
  if (p === '/api/admin/upload' && req.method === 'POST') {
    if (!hasPermission(actor, 'content.write')) return json(res, 403, { error: 'ليس لديك صلاحية رفع الصور.' });
    let data; try { data = await readBody(req, Math.ceil(MAX_UPLOAD * 1.5) + 2048); } catch (e) { return json(res, e.status || 400, { error: 'الملف غير صالح أو كبير جدًا.' }); }
    const match = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(data.dataUrl || '');
    if (!match) return json(res, 400, { error: 'الصيغ المسموحة: PNG, JPEG, WEBP, GIF.' });
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length || buffer.length > MAX_UPLOAD) return json(res, 413, { error: 'أقصى حجم للصورة 4 ميجابايت.' });
    const signatures = { png: '89504e470d0a1a0a', jpeg: 'ffd8ff', jpg: 'ffd8ff', webp: '52494646', gif: '47494638' };
    if (!buffer.subarray(0, signatures[match[1]].length / 2).toString('hex').startsWith(signatures[match[1]])) return json(res, 400, { error: 'محتوى الصورة لا يطابق نوع الملف.' });
    const ext = match[1] === 'jpg' ? 'jpg' : match[1];
    const name = crypto.randomUUID() + '.' + ext;
    await fs.promises.mkdir(path.join(DATA_DIR, 'uploads'), { recursive: true, mode: 0o700 });
    await fs.promises.writeFile(path.join(DATA_DIR, 'uploads', name), buffer, { flag: 'wx', mode: 0o600 });
    await transact(s => audit(s, actor, 'content.upload', name, { bytes: buffer.length, type: match[1] }));
    return json(res, 201, { url: '/media/' + name });
  }
  return json(res, 404, { error: 'المسار غير موجود.' });
}

module.exports = { handler, DATA_DIR, rolePermissions, readStore };
