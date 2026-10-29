'use strict';
(async function applySiteSettings(){
 try{
  const response=await fetch('/api/public/site-settings',{headers:{accept:'application/json'}});
  if(!response.ok)return;
  const result=await response.json();
  const settings=result.settings||{};
  const path=window.location.pathname.toLowerCase();
  const pageKey=path==='/'||path.endsWith('/index.html')?'home':path.endsWith('/services.html')?'services':path.endsWith('/pricing.html')?'pricing':path.endsWith('/process.html')?'process':path.endsWith('/about.html')?'about':path.endsWith('/faq.html')?'faq':'';
  const page=settings.page_content&&pageKey?settings.page_content[pageKey]:null;
  if(page&&typeof page.title==='string'&&page.title.trim()){
   const heading=document.querySelector('.hero h1, .page-hero h1');
   if(heading)heading.textContent=page.title.trim();
  }
  if(page&&typeof page.description==='string'&&page.description.trim()){
   const description=document.querySelector('.hero .lead, .page-hero>p:not(.eyebrow)');
   if(description)description.textContent=page.description.trim();
  }
  const root=document.documentElement;
  if(true){
   const value=typeof settings.hero_background_url==='string'&&settings.hero_background_url.trim()?settings.hero_background_url.trim():'https://raw.githubusercontent.com/BOB-Security/atsh-ai-website/main/platform/public/images/atsh-hero.jpg';
   const safe=/^https:\/\//i.test(value)||(/^\/(?!\/)[A-Za-z0-9_./-]+$/.test(value)&&!value.split('/').includes('..'));
   const hero=document.querySelector('.hero, .page-hero');
   if(safe&&hero){
    hero.style.backgroundImage='linear-gradient(110deg, rgba(17,16,32,.88), rgba(17,16,32,.62)), url("'+value.replace(/["\\]/g,'')+'")';
    hero.style.backgroundSize='cover';hero.style.backgroundPosition='center';
   }
  }
  if(/^#[0-9a-f]{6}$/i.test(settings.primary_color||'')){root.style.setProperty('--purple',settings.primary_color);root.style.setProperty('--lilac',settings.primary_color);}
  if(/^#[0-9a-f]{6}$/i.test(settings.accent_color||''))root.style.setProperty('--gold',settings.accent_color);
  if(!(page&&typeof page.title==='string'&&page.title.trim())&&typeof settings.hero_title==='string'&&settings.hero_title.trim()){
   const heading=document.querySelector('.hero h1, .page-hero h1');
   if(heading)heading.textContent=settings.hero_title.trim();
  }
  if(!(page&&typeof page.description==='string'&&page.description.trim())&&typeof settings.hero_description==='string'&&settings.hero_description.trim()){
   const description=document.querySelector('.hero .lead, .page-hero>p:not(.eyebrow)');
   if(description)description.textContent=settings.hero_description.trim();
  }
  const logoUrl=typeof settings.logo_url==='string'&&/^https:\/\//i.test(settings.logo_url)?settings.logo_url:'https://raw.githubusercontent.com/BOB-Security/atsh-ai-website/main/platform/public/images/atsh-logo.jpg';
  if(logoUrl){
   for(const brand of document.querySelectorAll('.brand')){
    const mark=brand.querySelector('.brand-mark,.mark');
    if(mark){const image=document.createElement('img');image.src=logoUrl;image.alt='ATSH AI';image.loading='lazy';image.style.cssText='width:100%;height:100%;object-fit:contain';mark.replaceChildren(image);}
   }
  }
  if(typeof settings.contact_email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.contact_email)){
   const contact=document.querySelector('#contact a[href^="mailto:"], a.contact-email');
   if(contact){contact.href='mailto:'+settings.contact_email;contact.textContent=settings.contact_email;}
  }
 }catch{}
})();
