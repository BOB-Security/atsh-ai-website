'use strict';
const $ = id => document.getElementById(id);
async function api(path, body, method) {
  const response = await fetch(path, { method: method || (body ? 'POST' : 'GET'), credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(result.message || result.error || 'Request failed'); error.code = result.error; error.status = response.status; throw error; }
  return result;
}
function status(id, message, kind = 'error') { const node = $(id); node.textContent = message || ''; node.dataset.state = message ? kind : ''; }
function showPanel(id) { ['loginPanel','setupPanel','recoveryPanel','dashboardPanel','catalogPanel'].forEach(key => { $(key).hidden = key !== id; }); }
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
