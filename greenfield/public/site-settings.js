'use strict';
(async function applySiteSettings(){
 try{
  const response=await fetch('/api/public/site-settings',{headers:{accept:'application/json'}});
  if(!response.ok)return;
  const result=await response.json();
  const settings=result.settings||{};
  const root=document.documentElement;
  if(/^#[0-9a-f]{6}$/i.test(settings.primary_color||'')){root.style.setProperty('--purple',settings.primary_color);root.style.setProperty('--lilac',settings.primary_color);}
  if(/^#[0-9a-f]{6}$/i.test(settings.accent_color||''))root.style.setProperty('--gold',settings.accent_color);
  if(typeof settings.hero_title==='string'&&settings.hero_title.trim()){
   const heading=document.querySelector('.hero h1, .page-hero h1');
   if(heading)heading.textContent=settings.hero_title.trim();
  }
  if(typeof settings.hero_description==='string'&&settings.hero_description.trim()){
   const description=document.querySelector('.hero .lead, .page-hero>p:not(.eyebrow)');
   if(description)description.textContent=settings.hero_description.trim();
  }
  if(typeof settings.logo_url==='string'&&/^https:\/\//i.test(settings.logo_url)){
   for(const brand of document.querySelectorAll('.brand')){
    const mark=brand.querySelector('.brand-mark,.mark');
    if(mark){const image=document.createElement('img');image.src=settings.logo_url;image.alt='ATSH AI';image.loading='lazy';image.style.cssText='width:100%;height:100%;object-fit:contain';mark.replaceChildren(image);}
   }
  }
  if(typeof settings.contact_email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.contact_email)){
   const contact=document.querySelector('#contact a[href^="mailto:"], a.contact-email');
   if(contact){contact.href='mailto:'+settings.contact_email;contact.textContent=settings.contact_email;}
  }
 }catch{}
})();
