'use strict';
document.addEventListener('change', event => {
  if (typeof current !== 'number' || current !== 4 || !event.target.matches('input[name^="opt-"]')) return;
  data.hosting = event.target.value;
  updateSummary();
});
