'use strict';
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const state = { user: null, csrf: '', content: { version: 1, theme: {}, pages: [], blocks: [] }, users: [], tasks: [], image: '' };
  const authView = $('#auth-view'), dashboard = $('#dashboard-view'), authMessage = $('#auth-message'), dashMessage = $('#dashboard-message');
  function message(el, text, bad = false) { el.hidden = !text; el.textContent = text || ''; el.classList.toggle('is-error', bad); }
  async function api(url, options = {}) {
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
    if (state.csrf && options.method && !['GET','HEAD'].includes(options.method)) headers['X-CSRF-Token'] = state.csrf;
    const res = await fetch(url, { credentials: 'same-origin', ...options, headers });
    const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : {};
    if (!res.ok) throw new Error(data.error || 'تعذر إتمام الطلب.');
    if (data.csrfToken) state.csrf = data.csrfToken;
    return data;
  }
  function el(tag, text, cls) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; }
  function btn(text, cls, action) { const b = el('button', text, cls || 'button button-quiet'); b.type = 'button'; b.addEventListener('click', action); return b; }
  function showDashboard() { authView.hidden = true; dashboard.hidden = false; $('#admin-user-label').textContent = state.user?.email || 'حساب الإدارة'; $('#dashboard-summary').textContent = 'مرحبًا ' + (state.user?.name || '') + ' — الدور: ' + (state.user?.role || ''); }
  function showAuth() { dashboard.hidden = true; authView.hidden = false; }
  async function refreshMe() {
    try { const d = await api('/api/admin/me'); state.user = d.user; state.csrf = d.csrfToken; showDashboard(); await loadContent(); await loadTeam(); await loadTasks(); }
    catch { showAuth(); }
  }
  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault(); message(authMessage, 'جارٍ التحقق من بيانات الدخول…');
    try {
      const d = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ email: $('#login-email').value, password: $('#login-password').value }) });
      state.user = d.user; state.csrf = d.csrfToken; message(authMessage, 'تم تسجيل الدخول بنجاح.'); showDashboard(); await loadContent(); await loadTeam(); await loadTasks();
    } catch (err) { message(authMessage, err.message, true); }
  });
  $('#request-code').addEventListener('click', async () => {
    message(authMessage, 'جارٍ طلب رمز التفعيل…');
    try { const d = await api('/api/admin/bootstrap/request', { method: 'POST', body: '{}' }); $('#bootstrap-form').hidden = false; message(authMessage, d.message); }
    catch (err) { message(authMessage, err.message, true); }
  });
  $('#bootstrap-form').addEventListener('submit', async e => {
    e.preventDefault(); message(authMessage, 'جارٍ تفعيل حساب المالك…');
    try {
      const d = await api('/api/admin/bootstrap/verify', { method: 'POST', body: JSON.stringify({ code: $('#bootstrap-code').value, password: $('#bootstrap-password').value }) });
      state.user = d.user; state.csrf = d.csrfToken; showDashboard(); await loadContent(); await loadTeam(); await loadTasks();
    } catch (err) { message(authMessage, err.message, true); }
  });
  $('#logout-button').addEventListener('click', async () => {
    try { await api('/api/admin/logout', { method: 'POST', body: '{}' }); } catch {}
    state.user = null; state.csrf = ''; showAuth(); message(authMessage, 'تم تسجيل الخروج.');
  });
  $$('.admin-tabs button').forEach(b => b.addEventListener('click', () => {
    $$('.admin-tabs button').forEach(x => x.classList.toggle('is-active', x === b));
    $$('.admin-panel').forEach(x => x.hidden = x.id !== 'panel-' + b.dataset.panel);
    if (b.dataset.panel === 'audit') loadAudit();
  }));
  function flash(text, bad = false) { message(dashMessage, text, bad); }
  function normalizePath(s) { return String(s || '').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\u0600-\u06ff]+/g, '-').replace(/^-|-$/g, '').slice(0, 80); }

  async function loadContent() {
    try {
      state.content = await api('/api/admin/content');
      const theme = state.content.theme || {};
      $$('[data-theme]').forEach(i => i.value = /^#[0-9a-f]{6}$/i.test(theme[i.dataset.theme] || '') ? theme[i.dataset.theme] : '#d9bd79');
      renderPages(); renderBlocks();
    } catch (e) { flash(e.message, true); }
  }
  function renderPages() {
    const list = $('#pages-list'), select = $('#block-page'); list.replaceChildren(); select.replaceChildren();
    [['home','الرئيسية'],['services','الخدمات'],['products','المنتجات'],['about','عن الشركة'],['contact','التواصل'],['privacy','الخصوصية'],['web-systems','الأنظمة والمواقع'],['business-bots','بوتات الأعمال'],['cloud-services','الخدمات السحابية'],['security-quality','الأمان والجودة']].forEach(([value,label]) => { const o = el('option',label); o.value = value; select.append(o); });
    for (const page of state.content.pages || []) {
      const item = el('div', undefined, 'admin-list-item');
      const title = el('div'); title.append(el('strong', page.title || page.path), el('small', page.path + (page.visible ? ' · ظاهر' : ' · مخفي')));
      item.append(title, btn('تعديل', 'admin-mini-button', () => { const nextTitle = prompt('عنوان الصفحة', page.title || ''); if (nextTitle === null) return; const nextPath = normalizePath(prompt('مسار الصفحة', (page.path || '').replace(/^\//, '')) || ''); if (!nextPath) return flash('المسار غير صالح.', true); if (state.content.pages.some(p => p.id !== page.id && p.path === '/' + nextPath)) return flash('المسار مستخدم بالفعل.', true); page.title = nextTitle.slice(0,160); page.path = '/' + nextPath; renderPages(); }), btn('إخفاء/إظهار', 'admin-mini-button', () => { page.visible = !page.visible; renderPages(); }), btn('حذف', 'admin-mini-button danger', () => { state.content.pages = state.content.pages.filter(p => p.id !== page.id); state.content.blocks = state.content.blocks.filter(b => b.pageId !== page.id); renderPages(); renderBlocks(); }));
      list.append(item);
      const option = el('option', page.title || page.path); option.value = page.id; select.append(option);
    }
    if (!state.content.pages.length) list.append(el('p', 'لم تُضف صفحات مخصصة بعد.', 'admin-help'));
  }
  function renderBlocks() {
    const list = $('#blocks-list'); list.replaceChildren();
    for (const block of state.content.blocks || []) {
      const card = el('article', undefined, 'admin-block-row');
      const head = el('div', undefined, 'admin-block-row-head');
      const swatch = el('span', undefined, 'admin-swatch'); swatch.style.background = block.color || '#d9bd79';
      const title = el('strong', (block.title || block.type) + ' · ' + (state.content.pages.find(p => p.id === block.pageId)?.title || 'الرئيسية'));
      head.append(swatch, title, el('small', block.visible ? 'ظاهر' : 'مخفي'));
      card.append(head);
      if (block.image) { const img = el('img', undefined, 'admin-thumb'); img.src = block.image; img.alt = block.title || 'صورة مرفوعة'; card.append(img); }
      if (block.body) card.append(el('p', block.body, 'admin-help'));
      const actions = el('div', undefined, 'admin-row-actions');
      actions.append(btn('تعديل النص', 'admin-mini-button', () => {
        const t = prompt('عنوان المحتوى', block.title || ''); if (t === null) return;
        const body = prompt('النص / الوصف', block.body || ''); if (body === null) return;
        block.title = t.slice(0,200); block.body = body.slice(0,5000); renderBlocks();
      }), btn('تغيير اللون', 'admin-mini-button', () => { const color = prompt('أدخل اللون بصيغة HEX مثل #36C9A8', block.color || '#d9bd79'); if (color === null) return; if (!/^#[0-9a-fA-F]{6}$/.test(color)) return flash('استخدم قيمة HEX مثل #36C9A8.', true); block.color = color; renderBlocks(); }), btn('إخفاء/إظهار', 'admin-mini-button', () => { block.visible = !block.visible; renderBlocks(); }), btn('حذف', 'admin-mini-button danger', () => { state.content.blocks = state.content.blocks.filter(b => b.id !== block.id); renderBlocks(); }));
      card.append(actions); list.append(card);
    }
    if (!state.content.blocks.length) list.append(el('p', 'لا توجد فقرات أو بطاقات مخصصة بعد.', 'admin-help'));
  }
  $('#page-form').addEventListener('submit', e => {
    e.preventDefault();
    const title = $('#page-title').value.trim(), path = normalizePath($('#page-path').value || title);
    if (!path) return flash('أدخل مسارًا صالحًا للصفحة.', true);
    if (state.content.pages.some(p => p.path === '/' + path)) return flash('هذا المسار مستخدم بالفعل.', true);
    state.content.pages.push({ id: crypto.randomUUID(), title, path: '/' + path, visible: $('#page-visible').checked, language: 'ar' });
    $('#page-title').value = ''; $('#page-path').value = ''; renderPages(); flash('أُضيفت الصفحة إلى مسودة المحتوى. اضغط حفظ التغييرات لنشرها.');
  });
  $$('[data-theme]').forEach(input => input.addEventListener('input', () => { state.content.theme ||= {}; state.content.theme[input.dataset.theme] = input.value; }));
  $('#block-image-file').addEventListener('change', async e => {
    const file = e.target.files?.[0]; state.image = '';
    if (!file) { $('#image-preview').hidden = true; return; }
    if (file.size > 4 * 1024 * 1024) { flash('أقصى حجم للصورة 4 ميجابايت.', true); e.target.value = ''; return; }
    const dataUrl = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
    try {
      const result = await api('/api/admin/upload', { method: 'POST', body: JSON.stringify({ dataUrl }) });
      state.image = result.url; const preview = $('#image-preview'); preview.replaceChildren(); const img = el('img'); img.src = state.image; img.alt = 'معاينة الصورة'; preview.append(img); preview.hidden = false;
      flash('تم رفع الصورة. احفظ المحتوى لتثبيتها في الصفحة.');
    } catch (err) { flash(err.message, true); e.target.value = ''; }
  });
  $('#block-form').addEventListener('submit', e => {
    e.preventDefault();
    const title = $('#block-title').value.trim(), body = $('#block-body').value.trim(), type = $('#block-type').value;
    if (!title && !body && !state.image) return flash('أضف عنوانًا أو نصًا أو صورة.', true);
    state.content.blocks.push({ id: crypto.randomUUID(), pageId: $('#block-page').value || 'home', type, title, body, image: state.image, color: $('#block-color').value, visible: $('#block-visible').checked });
    $('#block-title').value = ''; $('#block-body').value = ''; $('#block-image-file').value = ''; state.image = ''; $('#image-preview').hidden = true; renderBlocks(); flash('أُضيف المحتوى إلى المسودة. اضغط حفظ التغييرات.');
  });
  $('#save-content').addEventListener('click', async () => {
    try { const d = await api('/api/admin/content', { method: 'PUT', body: JSON.stringify(state.content) }); state.content.version = d.version; flash('تم حفظ تغييرات المحتوى على الخادم.'); }
    catch (e) { flash(e.message, true); }
  });

  async function loadTeam() {
    try {
      const d = await api('/api/admin/team'); state.users = d.users || [];
      const list = $('#team-list'); list.replaceChildren();
      if (!state.users.length) list.append(el('p', 'لم تتم إضافة أعضاء للفريق بعد.', 'admin-help'));
      for (const user of state.users) {
        const row = el('div', undefined, 'admin-table-row');
        const info = el('div'); info.append(el('strong', user.name), el('small', user.email + ' · ' + user.role + (user.active ? ' · نشط' : ' · موقوف')));
        row.append(info);
        if (state.user.role === 'Owner' || state.user.role === 'Administrator') {
          const role = el('select'); ['Assistant','Staff','Manager','Read-only','Administrator'].forEach(r => { const o = el('option', r); o.value = r; o.selected = user.role === r; role.append(o); });
          role.addEventListener('change', async () => { try { await api('/api/admin/team/' + encodeURIComponent(user.id), { method:'PATCH', body:JSON.stringify({ role:role.value }) }); flash('تم تحديث الدور.'); await loadTeam(); } catch(e) { flash(e.message,true); } });
          const permissions = el('select'); permissions.multiple = true; permissions.size = 3; permissions.setAttribute('aria-label','الصلاحيات الفردية');
          const selectedPermissions = user.permissions || d.roleDefaults[user.role] || [];
          (d.permissions || []).forEach(permission => { const o = el('option', permission); o.value = permission; o.selected = selectedPermissions.includes('*') || selectedPermissions.includes(permission); permissions.append(o); });
          row.append(role, permissions, btn('حفظ الصلاحيات', 'admin-mini-button', async () => { try { await api('/api/admin/team/' + encodeURIComponent(user.id), {method:'PATCH',body:JSON.stringify({permissions:[...permissions.selectedOptions].map(o=>o.value)})}); flash('تم حفظ الصلاحيات الفردية.'); await loadTeam(); } catch(e) { flash(e.message,true); } }), btn(user.active ? 'تعطيل' : 'تفعيل', 'admin-mini-button', async () => { try { await api('/api/admin/team/' + encodeURIComponent(user.id), {method:'PATCH',body:JSON.stringify({active:!user.active})}); await loadTeam(); flash('تم تحديث حالة الحساب.'); } catch(e) { flash(e.message,true); } }));
          if (state.user.role === 'Owner') row.append(btn('حذف', 'admin-mini-button danger', async () => { if (!confirm('حذف حساب ' + user.email + '؟')) return; try { await api('/api/admin/team/' + encodeURIComponent(user.id), {method:'DELETE'}); await loadTeam(); flash('تم حذف الحساب وإبطال جلساته.'); } catch(e) { flash(e.message,true); } }));
        }
        list.append(row);
      }
      const assignee = $('#task-assignee'); const previous = assignee.value; assignee.replaceChildren(el('option','غير مسندة')); assignee.firstChild.value = '';
      state.users.filter(u => u.active).forEach(u => { const o = el('option', u.name + ' — ' + u.role); o.value = u.id; assignee.append(o); }); assignee.value = previous;
    } catch (e) { if (e.message !== 'يلزم تسجيل الدخول.') flash(e.message, true); }
  }
  $('#team-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const d = await api('/api/admin/team', { method:'POST', body:JSON.stringify({name:$('#team-name').value,email:$('#team-email').value,role:$('#team-role').value}) });
      $('#team-name').value=''; $('#team-email').value=''; flash(d.message); await loadTeam();
    } catch(err) { flash(err.message,true); }
  });

  async function loadTasks() {
    try {
      const d = await api('/api/admin/tasks'); state.tasks = d.tasks || [];
      const list = $('#tasks-list'); list.replaceChildren();
      if (!state.tasks.length) list.append(el('p','لا توجد مهام حتى الآن.','admin-help'));
      const statuses = { todo:'لم تبدأ', doing:'قيد التنفيذ', blocked:'متوقفة', done:'مكتملة' };
      for (const task of state.tasks) {
        const card = el('article',undefined,'admin-block-row');
        card.append(el('h3',task.title),el('p',task.description || 'لا توجد تفاصيل.','admin-help'),el('small','الأولوية: '+task.priority+' · الاستحقاق: '+(task.dueDate||'غير محدد')));
        const select = el('select'); Object.entries(statuses).forEach(([v,label])=>{const o=el('option',label);o.value=v;o.selected=task.status===v;select.append(o);});
        select.addEventListener('change',async()=>{try{await api('/api/admin/tasks/'+encodeURIComponent(task.id),{method:'PATCH',body:JSON.stringify({status:select.value})});flash('تم تحديث حالة المهمة.');await loadTasks();}catch(e){flash(e.message,true);}});
        card.append(select); list.append(card);
      }
    } catch (e) { if (e.message !== 'يلزم تسجيل الدخول.') flash(e.message, true); }
  }
  $('#task-form').addEventListener('submit', async e => {
    e.preventDefault();
    try { await api('/api/admin/tasks',{method:'POST',body:JSON.stringify({title:$('#task-title').value,description:$('#task-description').value,assigneeId:$('#task-assignee').value,priority:$('#task-priority').value,dueDate:$('#task-due').value})}); $('#task-title').value=''; $('#task-description').value=''; flash('تم إنشاء المهمة.'); await loadTasks(); }
    catch(err){flash(err.message,true);}
  });
  async function loadAudit() {
    try { const d=await api('/api/admin/audit'); const list=$('#audit-list'); list.replaceChildren(); if(!d.events.length) list.append(el('p','لا توجد أحداث مسجلة بعد.','admin-help')); d.events.forEach(ev=>{const row=el('div',undefined,'admin-table-row');row.append(el('strong',ev.action),el('small',(ev.actorEmail||'')+' · '+ev.target+' · '+new Date(ev.at).toLocaleString('ar-EG')));list.append(row);}); }
    catch(e){flash(e.message,true);}
  }
  $('#refresh-audit').addEventListener('click',loadAudit);
  refreshMe();
})();