'use strict';
(async () => {
  try {
    const res = await fetch('/api/site-content', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    const theme = data.theme || {};
    const root = document.documentElement;
    const vars = { primary: '--cms-primary', accent: '--cms-accent', background: '--cms-background', surface: '--cms-surface', text: '--cms-text', muted: '--cms-muted', cardBorder: '--cms-card-border' };
    const globalVars = { primary: '--gold', accent: '--purple', background: '--bg', surface: '--panel2', text: '--text', muted: '--muted', cardBorder: '--line' };
    for (const [key, cssVar] of Object.entries(vars)) if (/^#[0-9a-f]{6}$/i.test(theme[key] || '')) { root.style.setProperty(cssVar, theme[key]); root.style.setProperty(globalVars[key], theme[key]); }
    const fontMap = { 'IBM Plex Sans Arabic': 'IBM Plex Sans Arabic', Cairo: 'Cairo', Tajawal: 'Tajawal', 'Noto Sans Arabic': 'Noto Sans Arabic' };
    if (fontMap[theme.fontAr]) { root.style.setProperty('--font-ar', `\"${fontMap[theme.fontAr]}\",sans-serif`); document.body.style.fontFamily = `\"${fontMap[theme.fontAr]}\",sans-serif`; }
    if (['12px','18px','24px'].includes(theme.cardRadius)) root.style.setProperty('--radius-md', theme.cardRadius);
    const path = location.pathname.replace(/\/+$/, '') || '/';
    const currentPage = (data.pages || []).find(p => p.path === path && p.visible);
    const nav = document.querySelector('.primary-nav');
    if (nav) {
      nav.querySelectorAll('[data-cms-link="true"]').forEach(a => a.remove());
      (data.pages || []).filter(page => page.visible).forEach(page => {
        const link = document.createElement('a'); link.href = page.path; link.textContent = page.title; link.dataset.cmsLink = 'true'; nav.append(link);
      });
    }
    if (document.body.dataset.cmsPage === 'template') {
      const page = currentPage;
      const main = document.querySelector('#cms-main');
      if (!page || !main) { document.querySelector('#cms-missing')?.removeAttribute('hidden'); return; }
      document.title = page.title + ' | atsh-ai';
      const h = document.createElement('h1'); h.textContent = page.title; main.append(h);
      const blocks = (data.blocks || []).filter(b => b.visible && b.pageId === page.id);
      blocks.forEach(block => main.append(makeBlock(block)));
      return;
    }
    const pageId = currentPage?.id || (path === '/' ? 'home' : path.replace(/^\/|\/$/g, '').replace(/\.html$/, ''));
    const blocks = (data.blocks || []).filter(b => b.visible && (b.pageId === pageId || (path === '/' && b.pageId === 'home')));
    if (!blocks.length) return;
    let section = document.querySelector('[data-cms-generated="true"]');
    if (!section) { section = document.createElement('section'); section.className = 'cms-generated-section'; section.dataset.cmsGenerated = 'true'; const container = document.createElement('div'); container.className = 'container'; section.append(container); document.querySelector('main')?.append(section); }
    const container = section.firstElementChild;
    blocks.forEach(block => container.append(makeBlock(block)));
  } catch {}
  function makeBlock(block) {
    const article = document.createElement(block.type === 'heading' ? 'section' : 'article');
    article.className = block.type === 'card' ? 'cms-content-card' : 'cms-content-block';
    if (/^#[0-9a-f]{6}$/i.test(block.color || '')) article.style.setProperty('--cms-block-color', block.color);
    if (block.title) { const title = document.createElement(block.type === 'heading' ? 'h2' : 'h3'); title.textContent = block.title; article.append(title); }
    if (block.image && /^\/media\/[a-f0-9-]{36}\.(png|jpg|jpeg|webp|gif)$/.test(block.image)) { const img = document.createElement('img'); img.src = block.image; img.alt = block.title || ''; img.loading = 'lazy'; article.append(img); }
    if (block.body) { const p = document.createElement('p'); p.textContent = block.body; article.append(p); }
    return article;
  }
})();