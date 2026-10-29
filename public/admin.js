'use strict';
const $ = id => document.getElementById(id);
async function api(path, body) {
  const response = await fetch(path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(result.message || result.error || 'Request failed'); error.code = result.error; error.status = response.status; throw error; }
  return result;
}
function status(id, message, kind = 'error') { const node = $(id); node.textContent = message || ''; node.dataset.state = message ? kind : ''; }
function showPanel(id) { ['loginPanel','setupPanel','recoveryPanel','dashboardPanel'].forEach(key => { $(key).hidden = key !== id; }); }
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
