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
async function loadAdminMembers(){
 const root=document.getElementById('adminMembersList');const roleSelect=document.getElementById('adminMemberRole');if(!root||!roleSelect)return;
 root.replaceChildren();const pending=document.createElement('p');pending.textContent='جارٍ تحميل فريق الإدارة…';root.append(pending);
 try{
  const response=await fetch('/api/admin/members',{credentials:'same-origin',headers:{accept:'application/json'}});
  const result=await response.json().catch(()=>({}));root.replaceChildren();
  if(!response.ok||!result.ok){root.textContent=response.status===403?'هذا الحساب لا يملك صلاحية إدارة أفراد الفريق.':'تعذر تحميل أفراد الإدارة.';return;}
  roleSelect.replaceChildren();
  for(const role of (result.roles||[])){const option=document.createElement('option');option.value=role.id;option.textContent=role.name;roleSelect.append(option);}
  if(!roleSelect.options.length){const option=document.createElement('option');option.value='';option.textContent='لا توجد أدوار مهيأة لهذه المؤسسة';roleSelect.append(option);}
  for(const member of (result.members||[])){
   const card=document.createElement('article');card.className='admin-catalog-plan';
   const title=document.createElement('strong');title.textContent=member.full_name||member.email;
   const detail=document.createElement('p');detail.textContent=(member.email||'')+' · '+(member.status||'غير معروف')+' · '+(Array.isArray(member.roles)?member.roles.map(r=>r.name).join('، '):'بدون دور');
   card.append(title,detail);root.append(card);
  }
  if(!(result.members||[]).length)root.textContent='لا توجد حسابات فريق مسجلة.';
 }catch{root.textContent='تعذر الاتصال بخدمة إدارة الفريق.';}
}
const memberForm=document.getElementById('adminMemberForm');
const memberMessage=document.getElementById('adminMemberMessage');
if(memberForm)memberForm.addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget;const val=name=>String(form.elements.namedItem(name)?.value||'').trim();
 const submit=form.querySelector('button[type="submit"]');if(submit)submit.disabled=true;
 if(memberMessage)memberMessage.textContent='جارٍ إنشاء الحساب…';
 try{
  const response=await fetch('/api/admin/members',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','accept':'application/json','x-csrf-token':csrfToken},body:JSON.stringify({member:{full_name:val('full_name'),email:val('email'),role_id:val('role_id'),password:String(form.elements.namedItem('password')?.value||'')}})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok){if(memberMessage)memberMessage.textContent=result.message||(response.status===403?'الحساب لا يملك صلاحية إدارة الفريق.':'تعذر إنشاء الحساب. تحقق من الدور والبريد الإلكتروني.');return;}
  form.reset();if(memberMessage)memberMessage.textContent='تم إنشاء الحساب. سلّم كلمة المرور المؤقتة للفرد عبر قناة آمنة.';
  await loadAdminMembers();
 }catch{if(memberMessage)memberMessage.textContent='تعذر الاتصال بخدمة إنشاء الحساب.';}
 finally{if(submit)submit.disabled=false;}
});
const reloadMembers=document.getElementById('adminReloadMembers');if(reloadMembers)reloadMembers.addEventListener('click',loadAdminMembers);
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
  if(result.ok&&result.user){csrfToken=result.csrfToken||'';showSignedIn(result.user);await loadOverview();await loadSchemaReadiness();await loadCatalog();await loadLeads();await loadSiteSettings();await loadPageContent();await loadAdminMembers();}
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

/* Structured admin workspace: tabs, local preview, explicit save-and-publish labels. */
function setupAdminWorkspace(){
 const dashboard=document.getElementById('adminDashboard');
 if(!dashboard||dashboard.dataset.workspaceReady)return;
 dashboard.dataset.workspaceReady='1';
 const welcome=dashboard.querySelector('.admin-welcome');
 const tabDefs=[
  {id:'overview',label:'نظرة عامة',icon:'◈',selectors:['#adminOverviewGrid','#adminSchemaReadiness']},
  {id:'identity',label:'هوية الموقع',icon:'✦',selectors:['#adminSiteSettingsForm']},
  {id:'pages',label:'محتوى الصفحات',icon:'▤',selectors:['#adminPageContentForm']},
  {id:'plans',label:'الخدمات والباقات',icon:'◇',selectors:['#adminPlanForm','#adminCatalogList']},
  {id:'leads',label:'الطلبات',icon:'▣',selectors:['#adminLeadsList']},
  {id:'team',label:'فريق الإدارة',icon:'♙',selectors:['#adminMemberForm','#adminMembersList','#adminPermissionList']}
 ];
 const nav=document.createElement('nav');nav.className='admin-tabs';nav.setAttribute('aria-label','أقسام لوحة الإدارة');
 const panes=document.createElement('div');panes.className='admin-tab-panes';
 const originalNodes=new Map();
 for(const def of tabDefs){
  const button=document.createElement('button');button.type='button';button.className='admin-tab';button.dataset.tab=def.id;button.setAttribute('role','tab');button.setAttribute('aria-controls','admin-tab-'+def.id);button.innerHTML='<span aria-hidden="true">'+def.icon+'</span><span>'+def.label+'</span>';nav.append(button);
  const pane=document.createElement('section');pane.className='admin-tab-pane';pane.id='admin-tab-'+def.id;pane.dataset.pane=def.id;pane.setAttribute('role','tabpanel');pane.setAttribute('aria-label',def.label);panes.append(pane);
  for(const selector of def.selectors){
   const target=dashboard.querySelector(selector);if(!target)continue;
   let node=target;
   if(selector==='#adminSiteSettingsForm'||selector==='#adminPageContentForm'||selector==='#adminPlanForm'||selector==='#adminMemberForm'){
    node=target.closest('.admin-panel')||target;
   }else if(selector==='#adminSchemaReadiness'){
    node=target.closest('.admin-panel')||target;
   }else if(selector==='#adminLeadsList'){
    node=target.closest('.admin-panel')||target;
   }else if(selector==='#adminMembersList'){
    node=target.closest('.admin-panel')||target;
   }else if(selector==='#adminCatalogList'){
    node=target.closest('.admin-panel')||target;
   }else if(selector==='#adminPermissionList'){
    node=target.closest('.admin-panel')||target;
   }
   if(node&&!originalNodes.has(node)){originalNodes.set(node,true);pane.append(node);}
  }
 }
 if(welcome)welcome.after(nav,panes);else dashboard.prepend(nav,panes);
 function activate(id){
  for(const button of nav.querySelectorAll('.admin-tab')){const active=button.dataset.tab===id;button.classList.toggle('is-active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;}
  for(const pane of panes.children)pane.hidden=pane.dataset.pane!==id;
 }
 nav.addEventListener('click',event=>{const button=event.target.closest('.admin-tab');if(button)activate(button.dataset.tab);});
 nav.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const buttons=[...nav.querySelectorAll('.admin-tab')];const current=buttons.indexOf(document.activeElement);let next=current;if(event.key==='Home')next=0;else if(event.key==='End')next=buttons.length-1;else next=(current+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next].focus();activate(buttons[next].dataset.tab);event.preventDefault();});
 activate('overview');
 const preview=document.createElement('div');preview.className='admin-preview-overlay';preview.hidden=true;preview.innerHTML='<section class="admin-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="adminPreviewTitle"><div class="admin-panel-heading"><div><small>معاينة قبل النشر</small><h2 id="adminPreviewTitle">معاينة التعديلات</h2></div><button type="button" class="btn secondary" data-preview-close>إغلاق</button></div><div class="admin-preview-body"></div><p class="admin-subtext">هذه معاينة محلية للقيم الحالية داخل النموذج. لا تُحفظ ولا تُنشر حتى تضغط زر الحفظ والنشر في النموذج.</p></section>';
 dashboard.append(preview);
 const previewBody=preview.querySelector('.admin-preview-body');
 function addPreviewButton(form,type){
  if(!form||form.querySelector('[data-preview-type="'+type+'"]'))return;
  const submit=form.querySelector('button[type="submit"]');if(!submit)return;
  submit.textContent=type==='pages'?'حفظ ونشر الصفحات':'حفظ ونشر إعدادات الموقع';
  const button=document.createElement('button');button.type='button';button.className='btn secondary admin-preview-button';button.dataset.previewType=type;button.textContent='معاينة قبل النشر';
  submit.before(button);
  button.addEventListener('click',()=>{
   previewBody.replaceChildren();
   const card=document.createElement('article');card.className='admin-live-preview';
   if(type==='identity'){
    const title=form.elements.namedItem('hero_title')?.value||'عنوان الواجهة الرئيسية';
    const description=form.elements.namedItem('hero_description')?.value||'وصف الواجهة الرئيسية';
    const bg=form.elements.namedItem('hero_background_url')?.value||'';
    if(bg){card.style.backgroundImage='linear-gradient(90deg,rgba(13,12,28,.9),rgba(13,12,28,.45)),url("'+bg.replace(/["\\]/g,'')+'")';}
    const logo=form.elements.namedItem('logo_url')?.value||'';
    if(logo){const img=document.createElement('img');img.src=logo;img.alt='معاينة الشعار';img.className='admin-preview-logo';img.onerror=()=>{img.alt='تعذر تحميل الشعار من الرابط الحالي';};card.append(img);}
    const h=document.createElement('h2');h.textContent=title;const p=document.createElement('p');p.textContent=description;card.append(h,p);
    const colors=document.createElement('div');colors.className='admin-preview-colors';
    for(const [label,key] of [['اللون الأساسي','primary_color'],['لون التمييز','accent_color']]){const item=document.createElement('span');item.textContent=label;item.style.borderColor=form.elements.namedItem(key)?.value||'#8c7aff';colors.append(item);}card.append(colors);
    const email=form.elements.namedItem('contact_email')?.value;if(email){const e=document.createElement('p');e.textContent='التواصل: '+email;card.append(e);}
   }else{
    const pages=[['الرئيسية','home'],['الخدمات','services'],['التسعير','pricing'],['آلية العمل','process'],['من نحن','about'],['الأسئلة الشائعة','faq']];
    for(const [label,key] of pages){const block=document.createElement('section');block.className='admin-preview-page';const h=document.createElement('h3');h.textContent=form.elements.namedItem(key+'_title')?.value||label;const p=document.createElement('p');p.textContent=form.elements.namedItem(key+'_description')?.value||'لم يُدخل وصف جديد — سيبقى النص الأصلي للموقع.';block.append(h,p);card.append(block);}
   }
   previewBody.append(card);preview.hidden=false;const close=preview.querySelector('[data-preview-close]');if(close)close.focus();
  });
 }
 addPreviewButton(document.getElementById('adminSiteSettingsForm'),'identity');
 addPreviewButton(document.getElementById('adminPageContentForm'),'pages');
 preview.addEventListener('click',event=>{if(event.target===preview||event.target.closest('[data-preview-close]'))preview.hidden=true;});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!preview.hidden)preview.hidden=true;});
 const planSubmit=document.querySelector('#adminPlanForm button[type="submit"]');if(planSubmit)planSubmit.textContent='حفظ ونشر الباقة';
}

setupAdminWorkspace();
checkSession();
