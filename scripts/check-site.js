'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const required = [
  'server.js',
  'admin-core.js',
  'public/cms.css',
  'public/cms-page.html',
  'public/site-cms.js',
  'public/admin/app.js',
  'public/admin/dashboard.css',
  'public/staff/login.html',
  'public/staff/activate.html',
  'public/staff/app.js',
  'public/index.html',
  'public/pricing.html',
  'public/pricing.js',
  'public/admin/index.html',
  'public/admin.css',
  'public/styles.css',
  'public/app.js',
  'public/services.html',
  'public/products.html',
  'public/about.html',
  'public/contact.html',
  'public/privacy.html',
  'public/web-systems.html',
  'public/business-bots.html',
  'public/cloud-services.html',
  'public/security-quality.html'
];
const missing = required.filter(file => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error('Missing required site files:', missing.join(', '));
  process.exit(1);
}
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
for (const marker of ['id="main-content"', 'id="project-form"', 'data-i18n']) {
  if (!html.includes(marker)) {
    console.error('Expected site marker not found:', marker);
    process.exit(1);
  }
}
for (const page of required.filter(file => file.startsWith('public/') && file.endsWith('.html') && file !== 'public/admin/index.html' && file !== 'public/cms-page.html' && !file.startsWith('public/staff/'))) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  if (!html.includes('lang="ar" dir="rtl"') || !html.includes('/styles.css') || !(page === 'public/pricing.html' ? html.includes('/pricing.js') : html.includes('/app.js'))) {
    console.error('Page is missing language metadata or shared assets:', page);
    process.exit(1);
  }
}
const adminHtml = fs.readFileSync(path.join(root, 'public/admin/index.html'), 'utf8');
if (!adminHtml.includes('name="robots" content="noindex,nofollow"') || !adminHtml.includes('دخول الإدارة')) {
  console.error('Admin portal must remain unindexed and clearly show that authentication is not activated.');
  process.exit(1);
}
const adminClient = fs.readFileSync(path.join(root, 'public/admin/app.js'), 'utf8');
for (const marker of ['/api/admin/content', '/api/admin/team', '/api/admin/tasks', '/api/admin/upload', '/api/admin/pricing', '/api/quotes']) {
  if (!adminClient.includes(marker)) { console.error('Admin client is missing API integration:', marker); process.exit(1); }
}
console.log('Site structure check passed.');
