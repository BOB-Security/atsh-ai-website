'use strict';

(() => {
  const tokenInput = document.querySelector('#adminToken');
  const loginButton = document.querySelector('#loginButton');
  const logoutButton = document.querySelector('#logoutButton');
  const statusLine = document.querySelector('#adminStatus');
  const results = document.querySelector('#adminResults');
  const rows = document.querySelector('#submissionRows');
  const filter = document.querySelector('#statusFilter');
  const refreshButton = document.querySelector('#refreshButton');
  const resultCount = document.querySelector('#resultCount');
  const emptyState = document.querySelector('#emptyState');
  let adminToken = '';

  const statusLabels = {
    new: 'جديد',
    reviewing: 'قيد المراجعة',
    approved: 'مقبول',
    rejected: 'مرفوض',
    closed: 'مغلق'
  };
  const typeLabels = { contact: 'تواصل', referral: 'إحالة' };

  function setStatus(message) {
    statusLine.textContent = message;
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': 'Bearer ' + adminToken,
        ...(options.headers || {})
      },
      cache: 'no-store'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) {
        adminToken = '';
        tokenInput.value = '';
        results.classList.add('admin-hidden');
        logoutButton.classList.add('admin-hidden');
      }
      throw new Error(data.error || 'تعذر تنفيذ الطلب.');
    }
    return data;
  }

  function cell(text, className) {
    const td = document.createElement('td');
    td.textContent = text == null || text === '' ? '—' : String(text);
    if (className) td.className = className;
    return td;
  }

  function statusSelect(item) {
    const td = document.createElement('td');
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'حالة الطلب ' + item.id);
    for (const [value, label] of Object.entries(statusLabels)) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = value === item.status;
      select.appendChild(option);
    }
    select.addEventListener('change', async () => {
      select.disabled = true;
      try {
        await api('/api/admin/submissions/' + encodeURIComponent(item.id) + '/status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: select.value })
        });
        item.status = select.value;
        setStatus('تم تحديث حالة الطلب ATS-' + String(item.id).padStart(6, '0') + '.');
        if (filter.value && filter.value !== item.status) await loadSubmissions();
      } catch (error) {
        setStatus(error.message);
        await loadSubmissions().catch(() => {});
      } finally {
        select.disabled = false;
      }
    });
    td.appendChild(select);
    return td;
  }

  function render(items) {
    rows.replaceChildren();
    for (const item of items) {
      const tr = document.createElement('tr');
      tr.append(
        cell('ATS-' + String(item.id).padStart(6, '0')),
        cell(typeLabels[item.type] || item.type),
        cell(item.name + '\n' + item.email),
        cell([item.subject, item.organization].filter(Boolean).join(' · ')),
        cell(item.message, 'admin-message'),
        cell(item.created_at),
        statusSelect(item)
      );
      rows.appendChild(tr);
    }
    resultCount.textContent = 'عدد النتائج: ' + items.length + (items.length === 100 ? ' (الحد الأقصى المعروض 100)' : '');
    emptyState.classList.toggle('admin-hidden', items.length > 0);
  }

  async function loadSubmissions() {
    if (!adminToken) return;
    refreshButton.disabled = true;
    setStatus('جارٍ تحميل الطلبات...');
    try {
      const query = filter.value ? '?status=' + encodeURIComponent(filter.value) : '';
      const data = await api('/api/admin/submissions' + query);
      render(data.submissions || []);
      results.classList.remove('admin-hidden');
      logoutButton.classList.remove('admin-hidden');
      setStatus('تم تحميل الطلبات. استخدم القائمة لتحديث الحالة.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      refreshButton.disabled = false;
    }
  }

  loginButton.addEventListener('click', async () => {
    const value = tokenInput.value.trim();
    if (!value) {
      setStatus('أدخل رمز الإدارة أولًا.');
      tokenInput.focus();
      return;
    }
    adminToken = value;
    await loadSubmissions();
  });
  tokenInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') loginButton.click();
  });
  refreshButton.addEventListener('click', loadSubmissions);
  filter.addEventListener('change', loadSubmissions);
  logoutButton.addEventListener('click', () => {
    adminToken = '';
    tokenInput.value = '';
    rows.replaceChildren();
    results.classList.add('admin-hidden');
    logoutButton.classList.add('admin-hidden');
    resultCount.textContent = '';
    setStatus('تم مسح رمز الإدارة من ذاكرة الصفحة.');
  });
})();
