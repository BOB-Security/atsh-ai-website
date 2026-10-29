'use strict';
const loginPanel=document.getElementById('adminLoginPanel');
const dashboard=document.getElementById('adminDashboard');
const loginForm=document.getElementById('adminLoginForm');
const loginMessage=document.getElementById('adminLoginMessage');
const statsRoot=document.getElementById('adminOverviewGrid');
const permissionRoot=document.getElementById('adminPermissionList');
const welcome=document.getElementById('adminWelcomeTitle');
const year=document.getElementById('adminYear');
if(year)year.textContent=String(new Date().getFullYear());
let csrfToken='';
const labels={leads_total:'إجمالي الطلبات',leads_new:'طلبات جديدة',projects_total:'المشروعات',tickets_open:'تذاكر مفتوحة',categories_active:'الخدمات النشطة',plans_active:'الباقات النشطة'};
function showMessage(message,kind='info'){if(loginMessage){loginMessage.textContent=message;loginMessage.dataset.kind=kind;}}
function renderStats(data){
 if(!statsRoot)return;
 statsRoot.replaceChildren();
 for(const [key,label] of Object.entries(labels)){
  const card=document.createElement('article');card.className='admin-stat';
  const title=document.createElement('span');title.textContent=label;
  const value=document.createElement('strong');const number=Number(data?.[key]);value.textContent=Number.isFinite(number)?new Intl.NumberFormat('ar-EG').format(number):'—';
  card.append(title,value);statsRoot.append(card);
 }
}
function renderPermissions(permissions){
 if(!permissionRoot)return;
 permissionRoot.replaceChildren();
 const list=Array.isArray(permissions)?permissions:[];
 if(!list.length){const p=document.createElement('p');p.textContent='لم تُسند صلاحيات إلى هذا الحساب بعد.';permissionRoot.append(p);return;}
 for(const item of list){const tag=document.createElement('span');tag.className='admin-permission';tag.textContent=item;permissionRoot.append(tag);}
}
function showSignedIn(user){
 if(loginPanel)loginPanel.hidden=true;
 if(dashboard)dashboard.hidden=false;
 if(welcome)welcome.textContent='مرحبًا، '+(user?.name||user?.email||'فريق ATSH AI');
 renderPermissions(user?.permissions);
}
async function loadOverview(){
 const response=await fetch('/api/admin/overview',{credentials:'same-origin',headers:{accept:'application/json'}});
 const result=await response.json().catch(()=>({}));
 if(response.ok&&result.ok&&result.overview){renderStats(result.overview);return;}
 if(statsRoot){statsRoot.replaceChildren();const p=document.createElement('p');p.textContent=response.status===403?'هذا الحساب لا يملك صلاحية عرض الملخص.':'الملخص غير متاح حتى اكتمال إعداد جداول الإدارة في بيئة الاختبار.';statsRoot.append(p);}
}
async function checkSession(){
 try{
  const response=await fetch('/api/admin/me',{credentials:'same-origin',headers:{accept:'application/json'}});
  if(!response.ok)return;
  const result=await response.json();
  if(result.ok&&result.user){csrfToken=result.csrfToken||'';showSignedIn(result.user);await loadOverview();}
 }catch{}
}
if(loginForm)loginForm.addEventListener('submit',async event=>{
 event.preventDefault();
 const submit=loginForm.querySelector('button[type="submit"]');
 if(submit)submit.disabled=true;
 showMessage('جارٍ التحقق من بيانات الدخول…');
 const formData=new FormData(loginForm);
 try{
  const response=await fetch('/api/admin/login',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({email:formData.get('email'),password:formData.get('password')})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok){showMessage(result.message||'لم يكتمل تسجيل الدخول. لم يتم إنشاء جلسة إدارة.','error');return;}
  csrfToken=result.csrfToken||'';loginForm.reset();showSignedIn(result.user);await loadOverview();
 }catch{showMessage('تعذر الوصول إلى خدمة المصادقة. لم يتم تسجيل الدخول.','error');}
 finally{if(submit)submit.disabled=false;}
});
const logout=document.getElementById('adminLogout');
if(logout)logout.addEventListener('click',async()=>{
 try{
  const response=await fetch('/api/admin/logout',{method:'POST',credentials:'same-origin',headers:{'x-csrf-token':csrfToken,'accept':'application/json'}});
  if(!response.ok)throw new Error('logout failed');
  if(dashboard)dashboard.hidden=true;if(loginPanel)loginPanel.hidden=false;showMessage('تم إنهاء جلسة الإدارة.');csrfToken='';
 }catch{showMessage('تعذر إنهاء الجلسة. أعد المحاولة.','error');}
});
checkSession();
