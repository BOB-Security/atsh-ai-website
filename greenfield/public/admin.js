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
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),10000);
  let response;
  try{response=await fetch('/api/admin/schema-readiness',{credentials:'same-origin',headers:{accept:'application/json'},signal:controller.signal});}
  finally{clearTimeout(timeout);}
  const result=await response.json().catch(()=>({}));root.replaceChildren();
  if(!response.ok||!result.ok){const p=document.createElement('p');p.textContent=response.status===403?'حسابك لا يملك صلاحية فحص الجاهزية.':'تعذر فحص مخطط قاعدة البيانات؛ رمز التشخيص: '+(result.diagnosticCode||'غير متاح')+'. لم يتم تغيير أي بيانات.';root.append(p);return;}
  for(const group of result.groups||[]){
   const section=document.createElement('section');section.className='admin-schema-group';
   const title=document.createElement('h3');title.textContent=group.name+' — '+(group.ready?'جاهز':'يحتاج مراجعة');section.append(title);
   if(group.ready){const p=document.createElement('p');p.textContent='الجداول والأعمدة المطلوبة موجودة.';section.append(p);}
   else for(const item of group.missing||[]){const p=document.createElement('p');p.textContent=item.table+': الأعمدة الناقصة '+(item.missingColumns||[]).join('، ');section.append(p);}
   root.append(section);
  }
 }catch(error){root.replaceChildren();const p=document.createElement('p');p.textContent=error?.name==='AbortError'?'استغرق فحص قاعدة البيانات وقتًا أطول من المسموح. أعد الفحص أو راجع اتصال قاعدة البيانات.':'تعذر الاتصال بخدمة فحص الجاهزية.';root.append(p);}
}
const siteSettingsForm=document.getElementById('adminSiteSettingsForm');
function siteSettingsMessage(message,kind='info'){const root=document.getElementById('adminSiteSettingsMessage');if(root){root.textContent=message;root.dataset.kind=kind;}}
async function loadSiteSettings(){
 if(!siteSettingsForm)return;
 siteSettingsMessage('جارٍ تحميل إعدادات الموقع…');
 try{
  const response=await fetch('/api/admin/site-settings',{credentials:'same-origin',headers:{accept:'application/json'}});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok){siteSettingsMessage(response.status===403?'لا يملك هذا الحساب صلاحية إدارة إعدادات الموقع.':'إعدادات الموقع غير متاحة. تأكد من تطبيق ترحيل قاعدة البيانات.','error');return;}
  const values=result.settings||{};
  for(const key of ['hero_title','hero_description','logo_url','hero_background_url','primary_color','accent_color','contact_email']){
   const field=siteSettingsForm.elements.namedItem(key);if(field&&typeof values[key]==='string')field.value=values[key];
  }
  siteSettingsMessage('تم تحميل الإعدادات الحالية.','success');
 }catch{siteSettingsMessage('تعذر الاتصال بإعدادات الموقع.','error');}
}
if(siteSettingsForm)siteSettingsForm.addEventListener('submit',async event=>{
 event.preventDefault();
 const submit=siteSettingsForm.querySelector('button[type="submit"]');if(submit)submit.disabled=true;
 const settings={};for(const key of ['hero_title','hero_description','logo_url','hero_background_url','primary_color','accent_color','contact_email'])settings[key]=String(siteSettingsForm.elements.namedItem(key)?.value||'').trim();
 siteSettingsMessage('جارٍ حفظ الإعدادات…');
 try{
  const response=await fetch('/api/admin/site-settings',{method:'PUT',credentials:'same-origin',headers:{'content-type':'application/json','accept':'application/json','x-csrf-token':csrfToken},body:JSON.stringify({settings})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok){siteSettingsMessage(result.message||'تعذر حفظ الإعدادات. لم يتم تأكيد أي تغيير.','error');return;}
  siteSettingsMessage('تم حفظ الإعدادات. افتح الموقع في نافذة جديدة أو حدّثه لرؤية التغييرات.','success');
 }catch{siteSettingsMessage('تعذر الاتصال بخدمة الحفظ.','error');}
 finally{if(submit)submit.disabled=false;}
});
const reloadSiteSettings=document.getElementById('adminReloadSiteSettings');if(reloadSiteSettings)reloadSiteSettings.addEventListener('click',loadSiteSettings);

const pageContentForm=document.getElementById('adminPageContentForm');
const pageContentMessage=(message,kind='info')=>{const root=document.getElementById('adminPageContentMessage');if(root){root.textContent=message;root.dataset.kind=kind;}};
const pageFieldMap={home:{title:'home_title',description:'home_description'},services:{title:'services_title',description:'services_description'},pricing:{title:'pricing_title',description:'pricing_description'},process:{title:'process_title',description:'process_description'},about:{title:'about_title',description:'about_description'},faq:{title:'faq_title',description:'faq_description'}};
async function loadPageContent(){
 if(!pageContentForm)return;
 pageContentMessage('جارٍ تحميل محتوى الصفحات…');
 try{
  const response=await fetch('/api/admin/site-settings',{credentials:'same-origin',headers:{accept:'application/json'}});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok){pageContentMessage(response.status===403?'لا يملك هذا الحساب صلاحية تعديل محتوى الصفحات.':'تعذر تحميل محتوى الصفحات؛ تحقق من جاهزية قاعدة البيانات.','error');return;}
  const content=result.settings?.page_content||{};
  for(const [page,fields] of Object.entries(pageFieldMap)){
   for(const [key,name] of Object.entries(fields)){
    const input=pageContentForm.elements.namedItem(name);
    if(input)input.value=content[page]?.[key]||'';
   }
  }
  pageContentMessage('تم تحميل محتوى الصفحات الحالي.','success');
 }catch{pageContentMessage('تعذر الاتصال بمحتوى الصفحات.','error');}
}
if(pageContentForm)pageContentForm.addEventListener('submit',async event=>{
 event.preventDefault();
 const submit=pageContentForm.querySelector('button[type="submit"]');if(submit)submit.disabled=true;
 const page_content={};
 for(const [page,fields] of Object.entries(pageFieldMap)){
  page_content[page]={};
  for(const [key,name] of Object.entries(fields))page_content[page][key]=String(pageContentForm.elements.namedItem(name)?.value||'').trim();
 }
 pageContentMessage('جارٍ حفظ تعديلات الصفحات…');
 try{
  const response=await fetch('/api/admin/site-settings',{method:'PUT',credentials:'same-origin',headers:{'content-type':'application/json','accept':'application/json','x-csrf-token':csrfToken},body:JSON.stringify({settings:{page_content}})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok){pageContentMessage(result.message||'تعذر حفظ تعديلات الصفحات. لم يتم تأكيد الحفظ.','error');return;}
  pageContentMessage('تم حفظ تعديلات الصفحات. حدّث الصفحة العامة لرؤية النتيجة.','success');
 }catch{pageContentMessage('تعذر الاتصال بخدمة الحفظ.','error');}
 finally{if(submit)submit.disabled=false;}
});
const reloadPages=document.getElementById('adminReloadPages');if(reloadPages)reloadPages.addEventListener('click',loadPageContent);

async function loadOverview(){
 const response=await fetch('/api/admin/overview',{credentials:'same-origin',headers:{accept:'application/json'}});
 const result=await response.json().catch(()=>({}));
 if(response.ok&&result.ok&&result.overview){renderStats(result.overview);return;}
 if(statsRoot){statsRoot.replaceChildren();const p=document.createElement('p');p.textContent=response.status===403?'هذا الحساب لا يملك صلاحية عرض الملخص.':'الملخص غير متاح حتى اكتمال إعداد جداول الإدارة في بيئة الاختبار.';statsRoot.append(p);}
}
let catalogCache=[];
function currencyDigits(currency){try{return new Intl.NumberFormat('en',{style:'currency',currency}).resolvedOptions().maximumFractionDigits;}catch{return 2;}}
function openPlanForm(plan=null,categoryId=''){
 const form=document.getElementById('adminPlanForm');if(!form)return;
 form.hidden=false;form.reset();
 form.elements.namedItem('id').value=plan?.id||'';
 const categorySelect=document.getElementById('adminPlanCategory');
 categorySelect.replaceChildren();
 for(const cat of catalogCache){const option=document.createElement('option');option.value=cat.id;option.textContent=cat.name?.ar||cat.slug;categorySelect.append(option);}
 categorySelect.value=plan?.categoryId||categoryId||catalogCache[0]?.id||'';
 const currency=plan?.currency||'EGP';const digits=currencyDigits(currency);const divisor=10**digits;const amounts=plan?.amountsMinor||{};
 form.elements.namedItem('slug').value=plan?.slug||'';
 form.elements.namedItem('name_ar').value=plan?.name?.ar||'';
 form.elements.namedItem('name_en').value=plan?.name?.en||'';
 form.elements.namedItem('description_ar').value=plan?.description?.ar||'';
 form.elements.namedItem('description_en').value=plan?.description?.en||'';
 form.elements.namedItem('currency').value=currency;
 form.elements.namedItem('setup_amount').value=Number(amounts.setup||0)/divisor;
 form.elements.namedItem('monthly_amount').value=Number(amounts.monthly||0)/divisor;
 form.elements.namedItem('annual_amount').value=Number(amounts.annual||0)/divisor;
 form.elements.namedItem('features').value=Array.isArray(plan?.features)?plan.features.join('\n'):'';
 form.elements.namedItem('active').checked=plan?plan.active!==false:true;
 form.elements.namedItem('sort_order').value=Number(plan?.sortOrder||0);
 const title=document.getElementById('adminPlanFormTitle');if(title)title.textContent=plan?'تعديل الباقة':'إضافة باقة جديدة';
 const msg=document.getElementById('adminPlanMessage');if(msg)msg.textContent='';
 form.scrollIntoView({behavior:'smooth',block:'start'});
}
async function loadCatalog(){
 const root=document.getElementById('adminCatalogList');if(!root)return;
 root.replaceChildren();const pending=document.createElement('p');pending.textContent='جارٍ تحميل الكتالوج…';root.append(pending);
 try{
  const response=await fetch('/api/admin/catalog',{credentials:'same-origin',headers:{accept:'application/json'}});
  const result=await response.json().catch(()=>({}));root.replaceChildren();
  if(!response.ok||!result.ok){const p=document.createElement('p');p.textContent=response.status===403?'لا يملك هذا الحساب صلاحية قراءة الكتالوج.':'الكتالوج غير متاح؛ تحقق من قاعدة البيانات والصلاحيات.';root.append(p);return;}
  catalogCache=Array.isArray(result.categories)?result.categories:[];
  if(!catalogCache.length){const p=document.createElement('p');p.textContent='لا توجد خدمات مسجلة في قاعدة البيانات حتى الآن.';root.append(p);}
  for(const category of catalogCache){
   const card=document.createElement('article');card.className='admin-catalog-category';
   const heading=document.createElement('div');heading.className='admin-catalog-heading';
   const title=document.createElement('h3');title.textContent=category.name?.ar||category.slug||'خدمة';
   const state=document.createElement('span');state.className='admin-state '+(category.active?'is-active':'is-inactive');state.textContent=category.active?'نشطة':'غير نشطة';
   heading.append(title,state);card.append(heading);
   const description=document.createElement('p');description.textContent=category.description?.ar||'';card.append(description);
   const add=document.createElement('button');add.type='button';add.className='btn secondary';add.textContent='إضافة باقة لهذه الخدمة';add.addEventListener('click',()=>openPlanForm(null,category.id));card.append(add);
   for(const plan of (Array.isArray(category.plans)?category.plans:[])){
    const item=document.createElement('div');item.className='admin-catalog-plan';
    const nameRow=document.createElement('div');nameRow.className='admin-plan-heading';
    const planTitle=document.createElement('strong');planTitle.textContent=plan.name?.ar||plan.slug||'باقة';
    const planState=document.createElement('span');planState.className='admin-state '+(plan.active?'is-active':'is-inactive');planState.textContent=plan.active?'نشطة':'غير نشطة';nameRow.append(planTitle,planState);item.append(nameRow);
    const digits=currencyDigits(plan.currency||'EGP');const amounts=plan.amountsMinor||{};const priceLines=document.createElement('div');priceLines.className='admin-plan-prices';
    for(const [key,label] of [['setup','التأسيس'],['monthly','شهريًا'],['annual','سنويًا']]){
     const amount=Number(amounts[key]);if(!Number.isFinite(amount))continue;
     let formatted=new Intl.NumberFormat('ar-EG',{style:'currency',currency:plan.currency||'EGP',maximumFractionDigits:digits}).format(amount/(10**digits));
     const line=document.createElement('span');line.textContent=label+': '+formatted;priceLines.append(line);
    }
    item.append(priceLines);
    if(Array.isArray(plan.features)&&plan.features.length){const features=document.createElement('p');features.className='admin-feature-list';features.textContent=plan.features.join(' · ');item.append(features);}
    const edit=document.createElement('button');edit.type='button';edit.className='btn secondary';edit.textContent='تعديل الباقة';edit.addEventListener('click',()=>openPlanForm({...plan,categoryId:category.id},category.id));item.append(edit);card.append(item);
   }
   root.append(card);
  }
 }catch{root.replaceChildren();const p=document.createElement('p');p.textContent='تعذر الاتصال بخدمة الكتالوج. لم يتم تأكيد أي تعديل.';root.append(p);}
}
const planForm=document.getElementById('adminPlanForm');
const planMessage=document.getElementById('adminPlanMessage');
const addPlanButton=document.getElementById('adminAddPlan');
if(addPlanButton)addPlanButton.addEventListener('click',()=>openPlanForm());
const cancelPlanButton=document.getElementById('adminCancelPlan');
if(cancelPlanButton)cancelPlanButton.addEventListener('click',()=>{if(planForm)planForm.hidden=true;});
if(planForm)planForm.addEventListener('submit',async event=>{
 event.preventDefault();
 const form=event.currentTarget;const value=name=>String(form.elements.namedItem(name)?.value||'').trim();
 const currency=value('currency');const digits=currencyDigits(currency);const toMinor=name=>Math.round(Number(value(name))*10**digits);
 const plan={
  category_id:value('category_id'),slug:value('slug'),name_ar:value('name_ar'),name_en:value('name_en'),
  description_ar:value('description_ar'),description_en:value('description_en'),currency,
  setup_amount_minor:toMinor('setup_amount'),monthly_amount_minor:toMinor('monthly_amount'),annual_amount_minor:toMinor('annual_amount'),
  features:value('features').split('\n').map(v=>v.trim()).filter(Boolean),active:form.elements.namedItem('active').checked,
  sort_order:Number(value('sort_order'))
 };
 const id=value('id');if(id)plan.id=id;
 const submit=form.querySelector('button[type="submit"]');if(submit)submit.disabled=true;
 if(planMessage)planMessage.textContent='جارٍ حفظ الباقة…';
 try{
  const response=await fetch('/api/admin/catalog/plans',{method:'PUT',credentials:'same-origin',headers:{'content-type':'application/json','accept':'application/json','x-csrf-token':csrfToken},body:JSON.stringify({plan})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok){if(planMessage)planMessage.textContent=response.status===403?'الحساب لا يملك صلاحية إدارة الباقات.':'تعذر حفظ الباقة؛ لم يتم تأكيد التغيير.';return;}
  if(planMessage)planMessage.textContent='تم حفظ الباقة بنجاح.';
  await loadCatalog();form.hidden=true;
 }catch{if(planMessage)planMessage.textContent='تعذر الاتصال بخدمة الحفظ.';}
 finally{if(submit)submit.disabled=false;}
});

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
  if(result.ok&&result.user){csrfToken=result.csrfToken||'';showSignedIn(result.user);await loadOverview();await loadSchemaReadiness();await loadCatalog();await loadLeads();await loadSiteSettings();await loadPageContent();}
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
  csrfToken=result.csrfToken||'';loginForm.reset();showSignedIn(result.user);await loadOverview();await loadSchemaReadiness();await loadCatalog();await loadLeads();await loadSiteSettings();await loadPageContent();
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
