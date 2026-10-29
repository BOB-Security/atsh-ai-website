'use strict';
const menu=document.getElementById('menuToggle');const nav=document.getElementById('mainNav');if(menu&&nav){menu.onclick=()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',open?'true':'false');};nav.querySelectorAll('a').forEach(a=>{a.onclick=()=>{nav.classList.remove('open');menu.setAttribute('aria-expanded','false');};});}
const y=document.getElementById('year');if(y)y.textContent=String(new Date().getFullYear());
const form=document.getElementById('inquiryForm');if(form){form.onsubmit=e=>{e.preventDefault();const status=document.getElementById('formStatus');if(status)status.textContent='الإرسال متوقف مؤقتًا؛ لم تُرسل بياناتك ولم يُنشأ طلب.';};}
