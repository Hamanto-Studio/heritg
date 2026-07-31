const menuToggle = document.querySelector('.menu-toggle');
const siteNav = document.querySelector('#site-nav');

menuToggle?.addEventListener('click', () => {
  const isOpen = siteNav.classList.toggle('is-open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

siteNav?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    siteNav.classList.remove('is-open');
    menuToggle?.setAttribute('aria-expanded', 'false');
  });
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
