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
async function loadSchemaReadiness(){
 const root=document.getElementById('adminSchemaReadiness');if(!root)return;
 root.replaceChildren();const pending=document.createElement('p');pending.textContent='جارٍ فحص توافق الجداول والأعمدة…';root.append(pending);
 try{
  const response=await fetch('/api/admin/schema-readiness',{credentials:'same-origin',headers:{accept:'application/json'}});
  const result=await response.json().catch(()=>({}));root.replaceChildren();
  if(!response.ok||!result.ok){const p=document.createElement('p');p.textContent=response.status===403?'حسابك لا يملك صلاحية فحص الجاهزية.':'تعذر فحص مخطط قاعدة البيانات؛ لم يتم تغيير أي بيانات.';root.append(p);return;}
  for(const group of result.groups||[]){
   const section=document.createElement('section');section.className='admin-schema-group';
   const title=document.createElement('h3');title.textContent=group.name+' — '+(group.ready?'جاهز':'يحتاج مراجعة');section.append(title);
   if(group.ready){const p=document.createElement('p');p.textContent='الجداول والأعمدة المطلوبة موجودة.';section.append(p);}
   else for(const item of group.missing||[]){const p=document.createElement('p');p.textContent=item.table+': الأعمدة الناقصة '+(item.missingColumns||[]).join('، ');section.append(p);}
   root.append(section);
  }
 }catch{root.replaceChildren();const p=document.createElement('p');p.textContent='تعذر الاتصال بخدمة فحص الجاهزية.';root.append(p);}
}
async function loadOverview(){
 const response=await fetch('/api/admin/overview',{credentials:'same-origin',headers:{accept:'application/json'}});
 const result=await response.json().catch(()=>({}));
 if(response.ok&&result.ok&&result.overview){renderStats(result.overview);return;}
 if(statsRoot){statsRoot.replaceChildren();const p=document.createElement('p');p.textContent=response.status===403?'هذا الحساب لا يملك صلاحية عرض الملخص.':'الملخص غير متاح حتى اكتمال إعداد جداول الإدارة في بيئة الاختبار.';statsRoot.append(p);}
}
async function loadCatalog(){
 const root=document.getElementById('adminCatalogList');if(!root)return;
 root.replaceChildren();
 const pending=document.createElement('p');pending.textContent='جارٍ تحميل الكتالوج…';root.append(pending);
 try{
  const response=await fetch('/api/admin/catalog',{credentials:'same-origin',headers:{accept:'application/json'}});
  const result=await response.json().catch(()=>({}));
  root.replaceChildren();
  if(!response.ok||!result.ok){const p=document.createElement('p');p.textContent=response.status===403?'لا يملك هذا الحساب صلاحية قراءة الكتالوج.':'الكتالوج غير متاح قبل التحقق من مخطط قاعدة البيانات والصلاحيات.';root.append(p);return;}
  if(!Array.isArray(result.categories)||!result.categories.length){const p=document.createElement('p');p.textContent='لا توجد خدمات مسجلة في قاعدة البيانات حتى الآن.';root.append(p);return;}
  for(const category of result.categories){
   const card=document.createElement('article');card.className='admin-catalog-category';
   const heading=document.createElement('div');heading.className='admin-catalog-heading';
   const title=document.createElement('h3');title.textContent=category.name?.ar||category.slug||'خدمة';
   const state=document.createElement('span');state.className='admin-state '+(category.active?'is-active':'is-inactive');state.textContent=category.active?'نشطة':'غير نشطة';
   heading.append(title,state);card.append(heading);
   const description=document.createElement('p');description.textContent=category.description?.ar||'';card.append(description);
   const plans=Array.isArray(category.plans)?category.plans:[];
   for(const plan of plans){
    const item=document.createElement('div');item.className='admin-catalog-plan';
    const planTitle=document.createElement('strong');planTitle.textContent=plan.name?.ar||plan.slug||'باقة';
    const planState=document.createElement('span');planState.className='admin-state '+(plan.active?'is-active':'is-inactive');planState.textContent=plan.active?'نشطة':'غير نشطة';
    const nameRow=document.createElement('div');nameRow.className='admin-plan-heading';nameRow.append(planTitle,planState);item.append(nameRow);
    const priceLines=document.createElement('div');priceLines.className='admin-plan-prices';
    const currency=typeof plan.currency==='string'?plan.currency.trim():'';
    const amounts=plan.amountsMinor||{};
    for(const [key,label] of [['setup','التأسيس'],['monthly','شهريًا'],['annual','سنويًا']]){
     const amount=Number(amounts[key]);if(!Number.isFinite(amount)||!currency)continue;
     let formatted='غير محدد';
     try{const digits=new Intl.NumberFormat('en',{style:'currency',currency}).resolvedOptions().maximumFractionDigits;formatted=new Intl.NumberFormat('ar-EG',{style:'currency',currency,maximumFractionDigits:digits}).format(amount/(10**digits));}catch{}
     const line=document.createElement('span');line.textContent=label+': '+formatted;priceLines.append(line);
    }
    item.append(priceLines);
    if(Array.isArray(plan.features)&&plan.features.length){const features=document.createElement('p');features.className='admin-feature-list';features.textContent=plan.features.filter(value=>typeof value==='string').join(' · ');item.append(features);}
    card.append(item);
   }
   root.append(card);
  }
 }catch{root.replaceChildren();const p=document.createElement('p');p.textContent='تعذر الاتصال بخدمة الكتالوج. لم يتم تعديل أي بيانات.';root.append(p);}
}
async function loadLeads(){
 const root=document.getElementById('adminLeadsList');if(!root)return;
 root.replaceChildren();const pending=document.createElement('p');pending.textContent='جارٍ تحميل الطلبات…';root.append(pending);
 try{
  const response=await fetch('/api/admin/leads',{credentials:'same-origin',headers:{accept:'application/json'}});
  const result=await response.json().catch(()=>({}));root.replaceChildren();
  if(!response.ok||!result.ok){const p=document.createElement('p');p.textContent=response.status===403?'لا يملك هذا الحساب صلاحية عرض الطلبات.':'قائمة الطلبات غير متاحة قبل التحقق من مخطط البيانات والصلاحيات.';root.append(p);return;}
  if(!Array.isArray(result.leads)||!result.leads.length){const p=document.createElement('p');p.textContent='لا توجد طلبات مسجلة حتى الآن.';root.append(p);return;}
  for(const lead of result.leads){
   const card=document.createElement('article');card.className='admin-lead-card';
   const heading=document.createElement('div');heading.className='admin-lead-heading';
   const reference=document.createElement('strong');reference.textContent=lead.reference||'طلب بدون مرجع';
   const status=document.createElement('span');status.className='admin-state '+(lead.status==='new'?'is-active':'is-inactive');status.textContent=lead.status||'غير محدد';heading.append(reference,status);card.append(heading);
   const name=document.createElement('h3');name.textContent=lead.customer_name||'عميل غير محدد';card.append(name);
   const details=document.createElement('p');details.textContent=[lead.solution_type,lead.source].filter(Boolean).join(' · ');card.append(details);
   if(lead.project_goal){const goal=document.createElement('p');goal.className='admin-lead-goal';goal.textContent=lead.project_goal;card.append(goal);}
   const contact=document.createElement('p');contact.className='admin-lead-contact';contact.textContent=[lead.customer_email,lead.customer_phone].filter(Boolean).join(' · ');card.append(contact);
   const date=document.createElement('small');const parsed=Date.parse(lead.created_at||'');date.textContent=Number.isFinite(parsed)?new Date(parsed).toLocaleString('ar-EG'):'تاريخ غير متاح';card.append(date);
   root.append(card);
  }
 }catch{root.replaceChildren();const p=document.createElement('p');p.textContent='تعذر الاتصال بخدمة الطلبات. لم يتم تعديل أي بيانات.';root.append(p);}
}
async function checkSession(){
 try{
  const response=await fetch('/api/admin/me',{credentials:'same-origin',headers:{accept:'application/json'}});
  if(!response.ok)return;
  const result=await response.json();
  if(result.ok&&result.user){csrfToken=result.csrfToken||'';showSignedIn(result.user);await loadOverview();await loadSchemaReadiness();await loadCatalog();await loadLeads();}
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
  csrfToken=result.csrfToken||'';loginForm.reset();showSignedIn(result.user);await loadOverview();await loadCatalog();await loadLeads();
 }catch{showMessage('تعذر الوصول إلى خدمة المصادقة. لم يتم تسجيل الدخول.','error');}
 finally{if(submit)submit.disabled=false;}
});
const reloadCatalog=document.getElementById('adminReloadCatalog');if(reloadCatalog)reloadCatalog.addEventListener('click',loadCatalog);
const reloadLeads=document.getElementById('adminReloadLeads');if(reloadLeads)reloadLeads.addEventListener('click',loadLeads);
const schemaReload=document.getElementById('adminReloadSchema');if(schemaReload)schemaReload.addEventListener('click',loadSchemaReadiness);
const logout=document.getElementById('adminLogout');
if(logout)logout.addEventListener('click',async()=>{
 try{
  const response=await fetch('/api/admin/logout',{method:'POST',credentials:'same-origin',headers:{'x-csrf-token':csrfToken,'accept':'application/json'}});
  if(!response.ok)throw new Error('logout failed');
  if(dashboard)dashboard.hidden=true;if(loginPanel)loginPanel.hidden=false;showMessage('تم إنهاء جلسة الإدارة.');csrfToken='';
 }catch{showMessage('تعذر إنهاء الجلسة. أعد المحاولة.','error');}
});
checkSession();
