'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const required = [
  'server.js',
  'public/index.html',
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
for (const page of required.filter(file => file.startsWith('public/') && file.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  if (!html.includes('lang="ar" dir="rtl"') || !html.includes('/styles.css') || !html.includes('/app.js')) {
    console.error('Page is missing language metadata or shared assets:', page);
    process.exit(1);
  }
}
console.log('Site structure check passed.');
