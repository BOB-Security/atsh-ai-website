'use strict';

const year = document.querySelector('#year');
if (year) year.textContent = String(new Date().getFullYear());

const menuToggle = document.querySelector('#menuToggle');
const mainNav = document.querySelector('#mainNav');
if (menuToggle && mainNav) {
  menuToggle.addEventListener('click', () => {
    const open = mainNav.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(open));
  });
  mainNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      mainNav.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
    });
  });
}
