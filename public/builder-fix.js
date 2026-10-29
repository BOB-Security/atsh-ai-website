'use strict';
document.addEventListener('change', event => {
  if (!event.target.matches('input[name="choice"]')) return;
  if (typeof current !== 'number') return;
  if (current === 1) data.pages = event.target.value;
  if (current === 4) data.hosting = event.target.value;
  updateSummary();
});
