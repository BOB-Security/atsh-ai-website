'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const required = [
  'server.js',
  'public/index.html',
  'public/styles.css',
  'public/app.js'
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
console.log('Site structure check passed.');
