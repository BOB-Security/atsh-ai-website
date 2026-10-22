'use strict';
(() => {
  const $ = s => document.querySelector(s);
  let csrf = '';
  function msg(text, bad = false) { const el = $('#staff-message'); el.hidden = !text; el.textContent = text || ''; el.classList.toggle('is-error', bad); }
  async function api(url, options = {}) {
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}) };
    if (csrf && options.method && options.method !== 'GET') headers['X-CSRF-Token'] = csrf;
    const res = await fetch(url, { credentials: 'same-origin', ...options, headers });
    const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : {};
    if (!res.ok) throw new Error(data.error || 'تعذر إتمام الطلب.');
    if (data.csrfToken) csrf = data.csrfToken;
    return data;
  }
  const activate = $('#staff-activate-form');
  if (activate) {
    activate.addEventListener('submit', async e => {
      e.preventDefault();
      const password = $('#staff-new-password').value;
      if (password !== $('#staff-confirm-password').value) return msg('كلمتا المرور غير متطابقتين.', true);
      const token = new URLSearchParams(location.search).get('token') || '';
      try { const d = await api('/api/admin/team/activate', { method:'POST', body:JSON.stringify({ token, password }) }); msg(d.message); activate.hidden = true; }
      catch(err) { msg(err.message, true); }
    });
    return;
  }
  const form = $('#staff-login-form');
  if (!form) return;
  async function loadTasks() {
    const d = await api('/api/admin/tasks');
    const list = $('#staff-tasks'); list.replaceChildren();
    const statusLabels = { todo:'لم تبدأ', doing:'قيد التنفيذ', blocked:'متوقفة', done:'مكتملة' };
    if (!d.tasks.length) { list.textContent = 'لا توجد مهام مسندة إليك حاليًا.'; return; }
    for (const task of d.tasks) {
      const card = document.createElement('article'); card.className = 'admin-block-row';
      const title = document.createElement('h3'); title.textContent = task.title; card.append(title);
      const desc = document.createElement('p'); desc.className = 'admin-help'; desc.textContent = task.description || 'لا توجد تفاصيل.'; card.append(desc);
      const select = document.createElement('select');
      Object.entries(statusLabels).forEach(([value,label]) => { const opt = document.createElement('option'); opt.value=value; opt.textContent=label; opt.selected=task.status===value; select.append(opt); });
      select.addEventListener('change', async () => { try { await api('/api/admin/tasks/' + encodeURIComponent(task.id), { method:'PATCH', body:JSON.stringify({ status:select.value }) }); msg('تم تحديث حالة المهمة.'); } catch(err) { msg(err.message,true); } });
      card.append(select); list.append(card);
    }
  }
  form.addEventListener('submit', async e => {
    e.preventDefault(); msg('جارٍ تسجيل الدخول…');
    try {
      await api('/api/admin/login', { method:'POST', body:JSON.stringify({ email:$('#staff-email').value, password:$('#staff-password').value }) });
      const me = await api('/api/admin/me');
      if (me.user.role === 'Owner' || me.user.role === 'Administrator' || me.user.role === 'Manager' || me.user.role === 'Staff' || me.user.role === 'Assistant' || me.user.role === 'Read-only') {
        form.hidden = true; $('#staff-work').hidden = false; msg('مرحبًا ' + me.user.name + ' — ' + me.user.role); await loadTasks();
      }
    } catch(err) { msg(err.message,true); }
  });
  $('#staff-logout')?.addEventListener('click', async () => { try { await api('/api/admin/logout',{method:'POST',body:'{}'}); } catch {} location.reload(); });
})();