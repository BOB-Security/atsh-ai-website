'use strict';
const $ = id => document.getElementById(id);
async function api(path, body, method) {
  const response = await fetch(path, { method: method || (body ? 'POST' : 'GET'), credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(result.message || result.error || 'Request failed'); error.code = result.error; error.status = response.status; throw error; }
  return result;
}
function status(id, message, kind = 'error') { const node = $(id); node.textContent = message || ''; node.dataset.state = message ? kind : ''; }
function showPanel(id) { ['loginPanel','setupPanel','recoveryPanel','dashboardPanel','catalogPanel','leadsPanel','quotesPanel','projectsPanel'].forEach(key => { $(key).hidden = key !== id; }); }
function setBusy(form, busy) { const button = form.querySelector('button[type="submit"]'); if (button) button.disabled = busy; }
async function loadDashboard(user) {
  showPanel('dashboardPanel');
  $('welcome').textContent = (user && (user.name || user.email)) || '';
  status('dashboardStatus','');
  try {
    const result = await api('/api/admin/overview');
    const labels = { customers:'العملاء', leads:'الطلبات الجديدة', projects:'المشاريع', quotes:'عروض الأسعار', tickets:'تذاكر الدعم', tasks:'المهام' };
    $('dashboardCounts').replaceChildren();
    Object.entries(result.counts || {}).forEach(([key,value]) => {
      const card = document.createElement('article'); card.className = 'metric-card';
      const label = document.createElement('span'); label.textContent = labels[key] || key;
      const count = document.createElement('strong'); count.textContent = String(value);
      card.append(label,count); $('dashboardCounts').append(card);
    });
  } catch (error) {
    status('dashboardStatus', error.code === 'permission_denied' ? 'ليس لديك صلاحية عرض المؤشرات.' : 'تعذر تحميل المؤشرات حاليًا. تحقق من الاتصال وقاعدة البيانات.');
  }
}
$('loginForm').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget; setBusy(form,true); status('loginStatus','جارٍ التحقق من بيانات الدخول…','pending');
  try {
    const result = await api('/api/admin/login',{email:$('loginEmail').value,password:$('loginPassword').value,totpCode:$('loginTotp').value});
    status('loginStatus',''); await loadDashboard(result.user);
  } catch (error) {
    if (error.code === 'mfa_setup_required') {
      $('setupEmail').value = $('loginEmail').value; $('setupPassword').value = $('loginPassword').value;
      $('showSetup').hidden = false; showPanel('setupPanel'); status('setupStatus','الحساب يحتاج إعداد المصادقة متعددة العوامل. أدخل رمز التهيئة المحفوظ في إعدادات النشر.');
    } else if (error.code === 'mfa_required') {
      status('loginStatus','أدخل رمزًا من تطبيق المصادقة أو رمز استرداد صالحًا.');
    } else if (error.code === 'mfa_migration_required') {
      status('loginStatus','يلزم تطبيق ترحيل MFA في بيئة الاختبار قبل تفعيل دخول الإدارة.');
    } else {
      status('loginStatus', error.status === 503 ? 'تسجيل الدخول غير متاح مؤقتًا. تحقق من إعداد قاعدة البيانات والترحيلات.' : 'بيانات الدخول أو رمز المصادقة غير صحيح.');
    }
  } finally { setBusy(form,false); }
});
$('showSetup').addEventListener('click', () => { $('setupEmail').value = $('loginEmail').value; $('setupPassword').value = $('loginPassword').value; showPanel('setupPanel'); });
$('setupForm').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget; setBusy(form,true); status('setupStatus','جارٍ التحقق وإنشاء مفتاح سري…','pending');
  try {
    const result = await api('/api/admin/mfa/setup',{email:$('setupEmail').value,password:$('setupPassword').value,bootstrapToken:$('bootstrapToken').value});
    $('mfaSecret').value = result.secret; $('otpauthLink').href = result.otpauthUrl; $('secretPanel').hidden = false;
    status('setupStatus','تم إنشاء المفتاح. أضفه إلى تطبيق المصادقة ثم أدخل الرمز الناتج.');
  } catch (error) {
    status('setupStatus', error.status === 403 ? 'رمز التهيئة غير صحيح أو غير مفعّل.' : error.status === 409 ? 'المصادقة مفعلة بالفعل لهذا الحساب.' : 'تعذر إعداد المصادقة. تأكد من تطبيق الترحيل وضبط مفاتيح التشفير.');
  } finally { setBusy(form,false); }
});
$('confirmMfaForm').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget; setBusy(form,true); status('confirmStatus','جارٍ التحقق من الرمز…','pending');
  try {
    const result = await api('/api/admin/mfa/confirm',{code:$('confirmCode').value});
    $('recoveryCodes').textContent = (result.recoveryCodes || []).join('\n'); showPanel('recoveryPanel');
  } catch {
    status('confirmStatus','الرمز غير صحيح أو انتهت جلسة الإعداد. حاول برمز جديد.');
  } finally { setBusy(form,false); }
});
$('continueAdmin').addEventListener('click', async () => { try { const result = await api('/api/admin/me'); await loadDashboard(result.user); } catch { showPanel('loginPanel'); status('loginStatus','انتهت الجلسة؛ سجّل الدخول مرة أخرى.'); } });
$('logoutButton').addEventListener('click', async () => { try { await api('/api/admin/logout',{}); } catch {} showPanel('loginPanel'); $('loginForm').reset(); status('loginStatus','تم تسجيل الخروج.','success'); });
$('adminLang').addEventListener('click', () => {
  const en = document.documentElement.lang === 'ar'; document.documentElement.lang = en ? 'en' : 'ar'; document.documentElement.dir = en ? 'ltr' : 'rtl'; $('adminLang').textContent = en ? 'عربي' : 'EN';
  $('adminHeading').textContent = en ? 'Operations portal' : 'بوابة الإدارة';
  $('adminLead').textContent = en ? 'Secure access with password and multi-factor authentication for privileged accounts.' : 'دخول آمن باستخدام كلمة المرور والمصادقة متعددة العوامل للحسابات المميزة.';
  $('loginHeading').textContent = en ? 'Sign in' : 'تسجيل الدخول';
  $('dashboardHeading').textContent = en ? 'Overview' : 'نظرة عامة';
});
$('year').textContent = new Date().getFullYear();
(async () => { try { const result = await api('/api/admin/me'); await loadDashboard(result.user); } catch { showPanel('loginPanel'); } })();

let catalogState = { categories:[], plans:[], addons:[], publicationApproved:false };
function makeElement(tag, className, text) { const el=document.createElement(tag); if(className)el.className=className; if(text!==undefined)el.textContent=String(text); return el; }
function moneyMinor(amount, currency) { const value=Number(amount||0)/100; try { return new Intl.NumberFormat('ar-EG',{style:'currency',currency:String(currency||'EGP').trim(),maximumFractionDigits:2}).format(value); } catch { return String(amount||0)+' '+String(currency||'EGP').trim()+' minor units'; } }
function renderList(containerId, items, kind) {
  const root=$(containerId); root.replaceChildren();
  if(!items.length){root.append(makeElement('p','catalog-empty','لا توجد عناصر بعد. أنشئ أول عنصر من النموذج أعلاه.'));return;}
  items.forEach(item=>{
    const card=makeElement('article','catalog-item');
    const title=makeElement('h4',null,(item.name_ar||item.slug)+' / '+(item.name_en||''));
    const state=makeElement('span','catalog-state '+(item.active?'active':'draft'),item.active?'نشط':'مسودة غير نشطة');
    title.append(state);card.append(title);
    if(item.description_ar)card.append(makeElement('p',null,item.description_ar));
    if(kind==='category')card.append(makeElement('p',null,'المعرّف: '+item.slug));
    if(kind==='plan'||kind==='addon'){
      card.append(makeElement('p',null,'التأسيس: '+moneyMinor(item.setup_amount_minor,item.currency)));
      card.append(makeElement('p',null,'شهري: '+moneyMinor(item.monthly_amount_minor,item.currency)+' · سنوي: '+moneyMinor(item.annual_amount_minor,item.currency)));
      if(kind==='plan')card.append(makeElement('p',null,'التصنيف: '+(catalogState.categories.find(c=>c.id===item.category_id)?.name_ar||'—')));
    }
    const actions=makeElement('div','item-actions');
    const toggle=makeElement('button','ghost',item.active?'إيقاف/أرشفة':'تفعيل');
    toggle.type='button';toggle.addEventListener('click',async()=>{
      toggle.disabled=true;
      try { await api('/api/admin/catalog/'+(kind==='category'?'categories':kind==='plan'?'plans':'addons')+'/'+encodeURIComponent(item.id),{active:!item.active},'PATCH');status('catalogStatus','تم تحديث حالة العنصر.','success');await loadCatalog(); }
      catch(error){status('catalogStatus',error.message||'تعذر تحديث العنصر.');}
      finally{toggle.disabled=false;}
    });
    actions.append(toggle);card.append(actions);root.append(card);
  });
}
async function loadCatalog() {
  status('catalogStatus','جارٍ تحميل الكتالوج…','pending');
  try {
    const result=await api('/api/admin/catalog');
    catalogState={categories:result.categories||[],plans:result.plans||[],addons:result.addons||[],publicationApproved:Boolean(result.publicationApproved)};
    const select=$('planCategory');select.replaceChildren();const placeholder=makeElement('option',null,'اختر تصنيفًا');placeholder.value='';select.append(placeholder);
    catalogState.categories.forEach(category=>{const option=makeElement('option',null,category.name_ar+' / '+category.slug);option.value=category.id;select.append(option);});
    renderList('categoryList',catalogState.categories,'category');renderList('planList',catalogState.plans,'plan');renderList('addonList',catalogState.addons,'addon');
    $('publicationState').textContent=catalogState.publicationApproved?'موافقة المالك مسجلة في قاعدة البيانات؛ يلزم أيضًا تفعيل CATALOG_PUBLICATION_APPROVED في بيئة النشر.':'لم يعتمد المالك نشر الأسعار بعد. ستظل الأسعار مخفية عن الجمهور.';
    $('togglePublication').textContent=catalogState.publicationApproved?'إلغاء اعتماد النشر':'اعتماد نشر الأسعار';
    status('catalogStatus','تم تحميل الكتالوج.','success');
  } catch(error) { status('catalogStatus',error.message||'تعذر تحميل الكتالوج. تحقق من الاتصال والصلاحيات.'); }
}
$('openCatalog').addEventListener('click',async()=>{showPanel('catalogPanel');await loadCatalog();});
$('catalogBack').addEventListener('click',()=>{showPanel('dashboardPanel');});
$('categoryForm').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;setBusy(form,true);
  try {
    await api('/api/admin/catalog/categories',{slug:$('categorySlug').value,name_ar:$('categoryAr').value,name_en:$('categoryEn').value,description_ar:$('categoryDescAr').value,description_en:$('categoryDescEn').value,sort_order:0});
    form.reset();status('catalogStatus','تم حفظ التصنيف كمسودة غير نشطة.','success');await loadCatalog();
  } catch(error){status('catalogStatus',error.message||'تعذر حفظ التصنيف.');} finally{setBusy(form,false);}
});
$('planForm').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;setBusy(form,true);
  try {
    await api('/api/admin/catalog/plans',{
      category_id:$('planCategory').value,slug:$('planSlug').value,name_ar:$('planAr').value,name_en:$('planEn').value,
      description_ar:$('planDescAr').value,description_en:$('planDescEn').value,
      setup_amount_minor:Number($('planSetup').value),monthly_amount_minor:Number($('planMonthly').value),annual_amount_minor:Number($('planAnnual').value),currency:$('planCurrency').value,
      features:$('planFeatures').value.split('\n').map(x=>x.trim()).filter(Boolean),features_en:$('planFeaturesEn').value.split('\n').map(x=>x.trim()).filter(Boolean),constraints:{}
    });
    form.reset();status('catalogStatus','تم حفظ الباقة كمسودة. الأسعار غير منشورة.','success');await loadCatalog();
  } catch(error){status('catalogStatus',error.message||'تعذر حفظ الباقة.');} finally{setBusy(form,false);}
});
$('addonForm').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;setBusy(form,true);
  try {
    await api('/api/admin/catalog/addons',{slug:$('addonSlug').value,name_ar:$('addonAr').value,name_en:$('addonEn').value,description_ar:$('addonDescAr').value,description_en:$('addonDescEn').value,setup_amount_minor:Number($('addonSetup').value),monthly_amount_minor:Number($('addonMonthly').value),annual_amount_minor:Number($('addonAnnual').value),currency:$('addonCurrency').value});
    form.reset();status('catalogStatus','تم حفظ الإضافة كمسودة غير نشطة.','success');await loadCatalog();
  } catch(error){status('catalogStatus',error.message||'تعذر حفظ الإضافة.');} finally{setBusy(form,false);}
});
$('togglePublication').addEventListener('click',async()=>{
  const approved=!catalogState.publicationApproved;
  if(approved&&!window.confirm('هل راجعت الأسعار والعملة والرسوم الدورية؟ سيظل عرض الأسعار متوقفًا حتى تفعيل CATALOG_PUBLICATION_APPROVED في إعدادات بيئة الإنتاج.'))return;
  try { const result=await api('/api/admin/catalog/publication',{approved});await loadCatalog();status('catalogStatus',result.publicPricesVisible?'تم اعتماد النشر على مستوى قاعدة البيانات والبيئة.':'تم تحديث اعتماد قاعدة البيانات؛ لا تزال بوابة البيئة تتحكم في إظهار الأسعار.','success'); }
  catch(error){status('catalogStatus',error.message||'تعذر تحديث اعتماد النشر.');}
});

const leadStatusLabels={new:'جديد',qualified:'مؤهل',scoped:'تم تحديد النطاق',quoted:'تم إرسال عرض',won:'تم الفوز',lost:'خاسر',spam:'مزعج'};
const quoteStatusLabels={draft:'مسودة',issued:'مرسل',accepted:'مقبول',rejected:'مرفوض',expired:'منتهي',cancelled:'ملغي'};
$('openLeads').addEventListener('click',async()=>{showPanel('leadsPanel');await loadLeads();});
$('openQuotes').addEventListener('click',async()=>{showPanel('quotesPanel');await loadQuotes();await loadQuoteLeadOptions();});
$('leadsBack').addEventListener('click',()=>showPanel('dashboardPanel'));
$('quotesBack').addEventListener('click',()=>showPanel('dashboardPanel'));
$('refreshLeads').addEventListener('click',loadLeads);
async function loadQuoteLeadOptions(){
 try{const result=await api('/api/admin/leads?limit=100');const select=$('quoteLead');select.replaceChildren();const placeholder=makeElement('option',null,'اختر طلبًا مؤهلًا لعرض السعر');placeholder.value='';select.append(placeholder);(result.items||[]).forEach(lead=>{const option=makeElement('option',null,lead.reference+' — '+(lead.customer_name||'عميل')+' ('+(leadStatusLabels[lead.status]||lead.status)+')');option.value=lead.id;select.append(option);});}
 catch(error){status('quotesStatus',error.message||'تعذر تحميل الطلبات المرتبطة بالعروض.');}
}
async function loadLeads(){
 status('leadsStatus','جارٍ تحميل الطلبات…','pending');
 const params=new URLSearchParams({limit:'100'});if($('leadSearch').value.trim())params.set('search',$('leadSearch').value.trim());if($('leadStatusFilter').value)params.set('status',$('leadStatusFilter').value);
 try{
  const result=await api('/api/admin/leads?'+params.toString());const root=$('leadsList');root.replaceChildren();
  if(!(result.items||[]).length)root.append(makeElement('p','catalog-empty','لا توجد طلبات مطابقة.'));
  (result.items||[]).forEach(lead=>{
   const card=makeElement('article','catalog-item');const title=makeElement('h4',null,lead.reference+' — '+(leadStatusLabels[lead.status]||lead.status));card.append(title);
   card.append(makeElement('p',null,(lead.customer_name||'عميل')+(lead.customer_email?' · '+lead.customer_email:'')));
   card.append(makeElement('p',null,lead.project_goal||'لم يكتب ملخصًا للمشروع.'));
   card.append(makeElement('p',null,'الخدمة: '+(lead.solution_type||'غير محددة')+' · '+new Date(lead.created_at).toLocaleDateString('ar-EG')));
   const actions=makeElement('div','item-actions');const select=document.createElement('select');Object.entries(leadStatusLabels).forEach(([value,label])=>{const option=makeElement('option',null,label);option.value=value;option.selected=value===lead.status;select.append(option);});
   const save=makeElement('button','button','حفظ الحالة');save.type='button';save.addEventListener('click',async()=>{save.disabled=true;try{await api('/api/admin/leads/'+encodeURIComponent(lead.id),{status:select.value},'PATCH');status('leadsStatus','تم تحديث حالة الطلب.','success');await loadLeads();await loadQuoteLeadOptions();}catch(error){status('leadsStatus',error.message||'تعذر تحديث الحالة.');}finally{save.disabled=false;}});
   actions.append(select,save);card.append(actions);root.append(card);
  });
  status('leadsStatus','تم تحميل '+(result.total||0)+' طلب.','success');
 }catch(error){status('leadsStatus',error.message||'تعذر تحميل الطلبات. تحقق من الصلاحيات والاتصال.');}
}
async function loadQuotes(){
 status('quotesStatus','جارٍ تحميل عروض الأسعار…','pending');
 try{
  const result=await api('/api/admin/quotes?limit=100');const root=$('quotesList');root.replaceChildren();
  if(!(result.items||[]).length)root.append(makeElement('p','catalog-empty','لا توجد عروض أسعار بعد.'));
  (result.items||[]).forEach(quote=>{
   const card=makeElement('article','catalog-item');card.append(makeElement('h4',null,quote.reference+' — '+(quoteStatusLabels[quote.status]||quote.status)));
   card.append(makeElement('p',null,(quote.customer_name||'عميل')+(quote.customer_email?' · '+quote.customer_email:'')));
   card.append(makeElement('p',null,'التأسيس: '+moneyMinor(quote.setup_total_minor,quote.currency)+' · شهري: '+moneyMinor(quote.monthly_total_minor,quote.currency)+' · سنوي: '+moneyMinor(quote.annual_total_minor,quote.currency)));
   if(quote.lead_reference)card.append(makeElement('p',null,'الطلب: '+quote.lead_reference));
   if(quote.valid_until)card.append(makeElement('p',null,'صالح حتى: '+String(quote.valid_until).slice(0,10)));
   if(quote.status==='draft'){
    const issue=makeElement('button','button','إصدار العرض وإنشاء رابط الموافقة');issue.type='button';issue.addEventListener('click',async()=>{issue.disabled=true;try{const issued=await api('/api/admin/quotes/'+encodeURIComponent(quote.id)+'/issue',{},'POST');$('issuedQuoteLink').replaceChildren();$('issuedQuoteLink').hidden=false;$('issuedQuoteLink').append(makeElement('p',null,'تم إصدار العرض. أرسل الرابط التالي للعميل؛ الرابط سري ومخصص لهذا العرض:'));const a=makeElement('a','issued-url',issued.url);a.href=issued.url;a.target='_blank';a.rel='noopener noreferrer';$('issuedQuoteLink').append(a);status('quotesStatus','تم إصدار العرض وحفظ رابط الاستجابة.','success');await loadQuotes();}catch(error){status('quotesStatus',error.message||'تعذر إصدار العرض. تأكد من تأهيل الطلب أولًا.');}finally{issue.disabled=false;}});
    const actions=makeElement('div','item-actions');actions.append(issue);card.append(actions);
   }
   root.append(card);
  });
  status('quotesStatus','تم تحميل '+(result.total||0)+' عرض سعر.','success');
 }catch(error){status('quotesStatus',error.message||'تعذر تحميل عروض الأسعار.');}
}
$('leadStatusFilter').addEventListener('change',loadLeads);
$('quoteForm').addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget;setBusy(form,true);$('issuedQuoteLink').hidden=true;
 try{
  const result=await api('/api/admin/quotes',{
   lead_id:$('quoteLead').value,currency:$('quoteCurrency').value,valid_until:$('quoteValidUntil').value||null,customer_note:$('quoteNote').value,
   items:[{description:$('quoteItemDescription').value,quantity:Number($('quoteQuantity').value),unit_setup_minor:Number($('quoteSetup').value),unit_monthly_minor:Number($('quoteMonthly').value),unit_annual_minor:Number($('quoteAnnual').value)}]
  });
  form.reset();$('quoteQuantity').value='1';$('quoteSetup').value='0';$('quoteMonthly').value='0';$('quoteAnnual').value='0';status('quotesStatus','تم حفظ المسودة '+result.quote.reference+'. لا يُرسل العرض للعميل حتى إصداره صراحة.','success');await loadQuotes();
 }catch(error){status('quotesStatus',error.message||'تعذر إنشاء المسودة. تحقق من الصلاحيات والأسعار.');}
 finally{setBusy(form,false);}
});

const projectStatusLabels={discovery:'اكتشاف',scoped:'تحديد النطاق',approved:'النطاق معتمد',in_progress:'قيد التنفيذ',blocked:'متوقف',review:'مراجعة',preview_ready:'المعاينة جاهزة',changes_requested:'تعديلات مطلوبة',client_approved:'موافقة العميل مسجلة',deploying:'جارٍ النشر',delivered:'تم التسليم',cancelled:'ملغي'};
const projectNextStatuses={discovery:['scoped','cancelled'],scoped:['approved','cancelled'],approved:['in_progress','cancelled'],in_progress:['blocked','review','preview_ready','cancelled'],blocked:['in_progress','cancelled'],review:['changes_requested'],preview_ready:['changes_requested'],changes_requested:['in_progress','cancelled'],client_approved:['deploying'],deploying:['delivered','blocked'],delivered:[],cancelled:[]};
$('openProjects').addEventListener('click',async()=>{showPanel('projectsPanel');await loadProjectLeadOptions();await loadProjects();});
$('projectsBack').addEventListener('click',()=>showPanel('dashboardPanel'));
async function loadProjectLeadOptions(){
 try{const result=await api('/api/admin/leads?status=won&limit=100');const select=$('projectLead');select.replaceChildren();const placeholder=makeElement('option',null,'اختر طلبًا فاز به العميل');placeholder.value='';select.append(placeholder);(result.items||[]).forEach(lead=>{const option=makeElement('option',null,lead.reference+' — '+(lead.customer_name||'عميل'));option.value=lead.id;select.append(option);});}
 catch(error){status('projectsStatus',error.message||'تعذر تحميل الطلبات المؤهلة لإنشاء مشروع.');}
}
async function loadProjects(){
 status('projectsStatus','جارٍ تحميل المشاريع…','pending');
 try{
  const result=await api('/api/admin/projects?limit=100');const root=$('projectsList');root.replaceChildren();
  if(!(result.items||[]).length)root.append(makeElement('p','catalog-empty','لا توجد مشاريع بعد. أنشئ مشروعًا من طلب وافق العميل على عرضه.'));
  (result.items||[]).forEach(project=>{
   const card=makeElement('article','catalog-item');card.append(makeElement('h4',null,project.title+' — '+(projectStatusLabels[project.status]||project.status)));
   card.append(makeElement('p',null,(project.customer_name||'عميل')+(project.customer_email?' · '+project.customer_email:'')));
   if(project.lead_reference)card.append(makeElement('p',null,'الطلب المرتبط: '+project.lead_reference));
   if(project.due_date)card.append(makeElement('p',null,'موعد التسليم: '+String(project.due_date).slice(0,10)));
   const next=projectNextStatuses[project.status]||[];
   if(next.length){const actions=makeElement('div','item-actions');const select=document.createElement('select');next.forEach(value=>{const option=makeElement('option',null,projectStatusLabels[value]||value);option.value=value;select.append(option);});const save=makeElement('button','button','تحديث الحالة');save.type='button';save.addEventListener('click',async()=>{save.disabled=true;try{await api('/api/admin/projects/'+encodeURIComponent(project.id)+'/status',{status:select.value},'PATCH');status('projectsStatus','تم تحديث حالة المشروع.','success');await loadProjects();}catch(error){status('projectsStatus',error.message||'تعذر تحديث الحالة.');}finally{save.disabled=false;}});actions.append(select,save);card.append(actions);}
   if(['review','preview_ready'].includes(project.status)){const approval=makeElement('button','ghost','تسجيل موافقة العميل');approval.type='button';approval.addEventListener('click',async()=>{const evidence=window.prompt('أدخل مرجع إثبات موافقة العميل وتاريخها (لا تلصق بيانات حساسة):');if(!evidence)return;approval.disabled=true;try{await api('/api/admin/projects/'+encodeURIComponent(project.id)+'/record-approval',{evidence});status('projectsStatus','تم تسجيل موافقة العميل في سجل التدقيق.','success');await loadProjects();}catch(error){status('projectsStatus',error.message||'تعذر تسجيل الموافقة.');}finally{approval.disabled=false;}});const actions=makeElement('div','item-actions');actions.append(approval);card.append(actions);}
   const links=makeElement('div','project-link-fields');const preview=document.createElement('input');preview.type='url';preview.placeholder='رابط المعاينة HTTPS';preview.value=project.preview_url||'';const repo=document.createElement('input');repo.type='url';repo.placeholder='رابط GitHub HTTPS';repo.value=project.repo_url||'';const production=document.createElement('input');production.type='url';production.placeholder='رابط الإنتاج HTTPS';production.value=project.production_url||'';const saveLinks=makeElement('button','ghost','حفظ الروابط');saveLinks.type='button';saveLinks.addEventListener('click',async()=>{saveLinks.disabled=true;try{await api('/api/admin/projects/'+encodeURIComponent(project.id)+'/links',{preview_url:preview.value,repo_url:repo.value,production_url:production.value},'PATCH');status('projectsStatus','تم حفظ الروابط بعد التحقق من HTTPS.','success');await loadProjects();}catch(error){status('projectsStatus',error.message||'تعذر حفظ الروابط.');}finally{saveLinks.disabled=false;}});links.append(preview,repo,production,saveLinks);card.append(links);
   root.append(card);
  });
  status('projectsStatus','تم تحميل '+(result.total||0)+' مشروع.','success');
 }catch(error){status('projectsStatus',error.message||'تعذر تحميل المشاريع. تحقق من الصلاحيات والاتصال.');}
}
$('projectForm').addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget;setBusy(form,true);
 try{const result=await api('/api/admin/projects/from-lead',{lead_id:$('projectLead').value,title:$('projectTitle').value,description:$('projectDescription').value,due_date:$('projectDueDate').value||null});form.reset();status('projectsStatus','تم إنشاء المشروع '+result.project.title+' في مرحلة الاكتشاف.','success');await loadProjects();await loadProjectLeadOptions();}
 catch(error){status('projectsStatus',error.message||'تعذر إنشاء المشروع. يلزم عرض سعر مقبول من العميل.');}
 finally{setBusy(form,false);}
});
