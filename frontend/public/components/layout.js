/* ============================================================
   ComboMaster — Shared Layout Loader (navbar + footer)
   ============================================================ */
(function () {
  const COMPONENTS = [
    { target: 'site-navbar', file: '/components/navbar.html' },
    { target: 'site-footer', file: '/components/footer.html' },
  ];

  async function inject({ target, file }) {
    const host = document.getElementById(target);
    if (!host) return;
    try {
      const res = await fetch(file);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      host.innerHTML = await res.text();
    } catch (err) {
      console.error(`[layout] Failed to load ${file}:`, err);
      host.innerHTML = `<p style="color:#a3a3a3;padding:1rem;font-size:.8rem">
        Could not load ${file}. Serve the site over http:// (e.g. VS Code Live Server).</p>`;
    }
  }

 /* ---- Live Chat (Tawk.to) ---- */
function initLiveChat() {
  var TAWK_SRC = 'https://embed.tawk.to/6acba13b90330834c24d263f/1k4lmrkc1';

  // Show logged-in members' names in your Tawk dashboard
  window.Tawk_API = window.Tawk_API || {};
  var name = localStorage.getItem('userName');
  if (name) {
    window.Tawk_API.onLoad = function () {
      window.Tawk_API.setAttributes({ name: name });
    };
  }

  var s1 = document.createElement('script');
  s1.async = true;
  s1.src = TAWK_SRC;
  s1.charset = 'UTF-8';
  s1.setAttribute('crossorigin', '*');
  document.body.appendChild(s1);
}

  /* ---- Highlight the nav link matching the current page ---- */
  function highlightActiveLinks() {
    const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    document.querySelectorAll('.nav-link, .mobile-nav-link').forEach((link) => {
      const active = (link.getAttribute('href') || '').toLowerCase() === page;
      link.classList.toggle('text-gold', active);
      link.classList.toggle('font-semibold', active);
      link.classList.toggle('text-muted-custom', !active);
      if (active) link.setAttribute('aria-current', 'page');
    });
  }

  /* ---- Theme toggle (persisted) ---- */
  const THEME_KEY = 'cm-theme';

  function updateThemeIcons(theme) {
    const icon = theme === 'light' ? 'sun' : 'moon';
    ['theme-icon-desktop', 'theme-icon-mobile'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.outerHTML = `<i data-lucide="${icon}" id="${id}" class="w-5 h-5 text-gold"></i>`;
    });
    if (window.lucide) lucide.createIcons();
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    document.body.classList.toggle('light-theme', saved === 'light');
    updateThemeIcons(saved);

    ['theme-toggle-desktop', 'theme-toggle-mobile'].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', () => {
        const next = document.body.classList.contains('light-theme') ? 'dark' : 'light';
        document.body.classList.toggle('light-theme', next === 'light');
        localStorage.setItem(THEME_KEY, next);
        updateThemeIcons(next);
      });
    });
  }

  /* ---- Mobile menu ---- */
  function setMenuIcon(open) {
    const el = document.getElementById('menu-icon');
    if (el) el.outerHTML = `<i data-lucide="${open ? 'x' : 'menu'}" id="menu-icon" class="w-6 h-6"></i>`;
    if (window.lucide) lucide.createIcons();
  }

  function initMobileMenu() {
    const toggle = document.getElementById('mobile-toggle');
    const menu = document.getElementById('mobile-menu');
    if (!toggle || !menu) return;

    window.closeMobileMenu = () => {      // used by onclick="" inside navbar.html
      menu.classList.remove('open');
      setMenuIcon(false);
    };

    toggle.addEventListener('click', () => {
      setMenuIcon(menu.classList.toggle('open'));
    });
  }

  /* ---- Cart count ---- */
  function updateCartCount() {
    let items = [];
    try {
      const saved = localStorage.getItem('cm-shop-cart');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) items = parsed;
      }
    } catch (error) {
      console.error('[layout] Could not read the saved cart:', error);
    }
    const count = items.reduce((total, item) =>
      total + (Number.isInteger(item?.quantity) && item.quantity > 0 ? item.quantity : 0), 0
    );
    [
      ['cart-trigger', 'cart-trigger-count'],
      ['cart-trigger-mobile', 'cart-trigger-count-mobile']
    ].forEach(([triggerId, badgeId]) => {
      const trigger = document.getElementById(triggerId);
      const badge = document.getElementById(badgeId);
      if (badge) badge.textContent = String(count);
      if (trigger) trigger.setAttribute('aria-label', `Shopping cart, ${count} ${count === 1 ? 'item' : 'items'}`);
    });
  }

  /* ---- Nav shadow and fixed top position ---- */
  function initScrollEffects() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;

    const update = () => {
      const y = window.scrollY;
      navbar.classList.toggle('nav-scrolled', y > 24);
      navbar.style.top = '0';
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
  }

  /* ---- Boot ---- */
  document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all(COMPONENTS.map(inject));
    highlightActiveLinks();
    initMobileMenu();
    initTheme();
    initScrollEffects();
    updateCartCount();
    window.addEventListener('storage', (event) => {
      if (event.key === 'cm-shop-cart') updateCartCount();
    });
    initLiveChat();
    const year = document.getElementById('footer-year');
    if (year) year.textContent = new Date().getFullYear();
    if (window.lucide) lucide.createIcons();   // render icons inside injected HTML
  });
})();