const menuToggle = document.querySelector('.menu-toggle');
const siteNav = document.querySelector('#site-nav');
const isIndonesian = document.documentElement.lang === 'id';

document.querySelectorAll('[data-language]').forEach((link) => {
  link.addEventListener('click', () => {
    try { localStorage.setItem('heritg-language', link.dataset.language); } catch (_) {}
  });
});

function closeMenu(returnFocus = false) {
  siteNav?.classList.remove('is-open');
  menuToggle?.setAttribute('aria-expanded', 'false');
  menuToggle?.setAttribute('aria-label', isIndonesian ? 'Buka menu' : 'Open menu');
  if (returnFocus) menuToggle?.focus();
}

menuToggle?.addEventListener('click', () => {
  const isOpen = siteNav.classList.toggle('is-open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
  menuToggle.setAttribute('aria-label', isOpen
    ? (isIndonesian ? 'Tutup menu' : 'Close menu')
    : (isIndonesian ? 'Buka menu' : 'Open menu'));
  if (isOpen) siteNav.querySelector('a')?.focus();
});

siteNav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  closeMenu();
  const section = document.querySelector(link.hash);
  const focusTarget = section?.querySelector('h2, h3') || section;
  requestAnimationFrame(() => {
    if (!focusTarget) return;
    focusTarget.tabIndex = -1;
    focusTarget.focus({ preventScroll: true });
    focusTarget.addEventListener('blur', () => focusTarget.removeAttribute('tabindex'), { once: true });
  });
}));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && siteNav?.classList.contains('is-open')) closeMenu(true);
});

document.querySelector('#year').textContent = new Date().getFullYear();

fetch('https://api.github.com/repos/Hamanto-Studio/heritg')
  .then((response) => response.ok ? response.json() : Promise.reject())
  .then((repository) => {
    document.querySelectorAll('[data-github-stars]').forEach((element) => {
      element.textContent = repository.stargazers_count.toLocaleString();
    });
  })
  .catch(() => {});

document.querySelectorAll('details').forEach((item) => {
  item.addEventListener('toggle', () => {
    if (!item.open) return;
    document.querySelectorAll('details[open]').forEach((other) => {
      if (other !== item) other.removeAttribute('open');
    });
  });
});

if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('motion-ready');
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in-view');
      revealObserver.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -12% 0px' });
  document.querySelectorAll('.privacy-showcase, .interactive-tree').forEach((section) => revealObserver.observe(section));
}
