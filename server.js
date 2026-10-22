'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 3000);
const MAX_BODY = 24 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8'
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (Buffer.byteLength(raw) > MAX_BODY) {
        reject(Object.assign(new Error('Request too large'), { status: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); }
      catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function clean(value, max = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function handleInquiry(req, res) {
  let data;
  try { data = await readBody(req); }
  catch (err) { return send(res, err.status || 400, { error: err.message || 'Invalid request' }); }

  // Honeypot: silently accept bot submissions without forwarding them.
  if (clean(data.website, 200)) {
    return send(res, 202, { ok: true, reference: crypto.randomUUID() });
  }

  const inquiry = {
    reference: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    name: clean(data.name, 120),
    email: clean(data.email, 254),
    service: clean(data.service, 100),
    budget: clean(data.budget, 100),
    timeline: clean(data.timeline, 100),
    message: clean(data.message, 5000),
    language: data.language === 'en' ? 'en' : 'ar'
  };

  if (!inquiry.name || !inquiry.email || !inquiry.message ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inquiry.email)) {
    return send(res, 400, { error: 'يرجى إدخال الاسم والبريد الإلكتروني الصحيح ووصف المشروع.' });
  }

  const webhook = process.env.INQUIRY_WEBHOOK_URL;
  if (!webhook) {
    return send(res, 503, {
      error: inquiry.language === 'en'
        ? 'Online submission is not activated yet. Please contact the company through its verified contact channel.'
        : 'استقبال الطلبات الإلكتروني لم يُفعّل بعد. لم يتم حفظ طلبك أو إرساله؛ يرجى التواصل عبر قناة الشركة المعتمدة.'
    });
  }

  let endpoint;
  try { endpoint = new URL(webhook); }
  catch { return send(res, 503, { error: 'Inquiry integration is not configured correctly.' }); }
  if (endpoint.protocol !== 'https:') {
    return send(res, 503, { error: 'Inquiry integration must use HTTPS.' });
  }

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Request-Reference': inquiry.reference },
      body: JSON.stringify(inquiry),
      signal: AbortSignal.timeout(8000)
    });
    if (!upstream.ok) throw new Error('Inquiry provider rejected request');
    return send(res, 201, { ok: true, reference: inquiry.reference });
  } catch {
    return send(res, 502, {
      error: inquiry.language === 'en'
        ? 'We could not send the request right now. Please try again later.'
        : 'تعذر إرسال الطلب الآن. لم نؤكد استلامه؛ يرجى المحاولة لاحقًا.'
    });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, { ok: true, service: 'atsh-ai-website' });
  }
  if (req.method === 'POST' && url.pathname === '/api/project-inquiries') {
    return handleInquiry(req, res);
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, { error: 'Method not allowed' });
  }

  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { return send(res, 400, { error: 'Bad path' }); }
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/admin' || pathname === '/admin/') pathname = '/admin/index.html';

  const filePath = path.resolve(ROOT, '.' + pathname);
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== path.join(ROOT, 'index.html')) {
    return send(res, 403, { error: 'Forbidden' });
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, { error: 'Not found' });
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
      'Cache-Control': path.extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`atsh-ai website listening on port ${PORT}`);
  });
}

module.exports = server;
