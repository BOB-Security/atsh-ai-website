'use strict';

const form = document.querySelector('#contactForm');
if (form) {
  const status = document.querySelector('#contactStatus');
  const submitButton = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const originalLabel = submitButton.textContent;
    submitButton.disabled = true;
    status.textContent = 'جارٍ إرسال الطلب...';
    status.classList.remove('hidden');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.get('name'),
          email: data.get('email'),
          subject: data.get('type'),
          message: data.get('brief'),
          website: data.get('website') || ''
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'تعذر إرسال الطلب الآن.');

      status.textContent = result.reference
        ? result.message + ' الرقم المرجعي: ' + result.reference
        : result.message || 'تم استلام الطلب.';
      status.classList.remove('hidden');
      form.reset();
    } catch (error) {
      status.textContent = error.message || 'تعذر الاتصال بالخادم. حاول مرة أخرى لاحقًا.';
      status.classList.remove('hidden');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalLabel;
    }
  });
}
