/* ============================================================
   ComboMaster — Shared Layout Loader (navbar + footer)
   ============================================================ */
(function () {
  'use strict';

  const COMPONENTS = [
    { target: 'site-navbar', file: '/components/navbar.html' },
    { target: 'site-footer', file: '/components/footer.html' },
  ];

  const THEME_KEY = 'cm-theme';

  /* ---- Guard flags so repeated boots don't stack listeners ---- */
  const bound = {
    theme: false,
    mobileMenu: false,
    scroll: false,
    storage: false,
    liveChat: false,
  };

  /* ---- Inject an HTML partial into a host element ---- */
  async function inject({ target, file }) {
    const host = document.getElementById(target);
    if (!host) return null;
    try {
      const res = await fetch(file, { cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      host.innerHTML = await res.text();
      return host;
    } catch (err) {
      console.error(`[layout] Failed to load ${file}:`, err);
      host.innerHTML = `<p style="color:#a3a3a3;padding:1rem;font-size:.8rem">
        Could not load ${file}. Serve the site over http:// (e.g. VS Code Live Server).</p>`;
      return host;
    }
  }

  /* ---- Live Chat (Tawk.to) ---- */
  function initLiveChat() {
    if (bound.liveChat) return;
    bound.liveChat = true;

    var TAWK_SRC = 'https://embed.tawk.to/6acba13b90330834c24d263f/1k4lmrkc1';

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
      // Strip query string and hash, then take the last path segment.
      // Works whether href is "about.html", "/about.html", or "/about.html?x=1".
      const raw = (link.getAttribute('href') || '').split('#')[0].split('?')[0];
      const target = (raw.split('/').pop() || 'index.html').toLowerCase();
      const active = target === page;

      link.classList.toggle('text-gold', active);
      link.classList.toggle('font-semibold', active);
      link.classList.toggle('text-muted-custom', !active);
      if (active) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  /* ---- Theme toggle (persisted) ---- */
  function updateThemeIcons(theme) {
    const icon = theme === 'light' ? 'sun' : 'moon';
    ['theme-icon-desktop', 'theme-icon-mobile'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.outerHTML = `<i data-lucide="${icon}" id="${id}" class="w-5 h-5 text-gold"></i>`;
    });
    if (window.lucide) lucide.createIcons();
  }

  function initTheme() {
    if (bound.theme) return;
    bound.theme = true;

    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    document.body.classList.toggle('light-theme', saved === 'light');
    updateThemeIcons(saved);

    ['theme-toggle-desktop', 'theme-toggle-mobile'].forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('click', () => {
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
    if (bound.mobileMenu) return;
    const toggle = document.getElementById('mobile-toggle');
    const menu = document.getElementById('mobile-menu');
    if (!toggle || !menu) return;
    bound.mobileMenu = true;

    // Exposed globally because navbar.html uses onclick="closeMobileMenu()"
    window.closeMobileMenu = () => {
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
      total + (Number.isInteger(item && item.quantity) && item.quantity > 0 ? item.quantity : 0), 0
    );

    [
      ['cart-trigger', 'cart-trigger-count'],
      ['cart-trigger-mobile', 'cart-trigger-count-mobile'],
    ].forEach(([triggerId, badgeId]) => {
      const trigger = document.getElementById(triggerId);
      const badge = document.getElementById(badgeId);
      if (badge) badge.textContent = String(count);
      if (trigger) trigger.setAttribute('aria-label', `Shopping cart, ${count} ${count === 1 ? 'item' : 'items'}`);
    });
  }

  /* ---- Nav shadow and fixed top position ---- */
  function initScrollEffects() {
    if (bound.scroll) return;
    const navbar = document.getElementById('navbar');
    if (!navbar) return;
    bound.scroll = true;

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
    // 1. Wait for both partials to be in the DOM.
    const [navbarHost, footerHost] = await Promise.all(COMPONENTS.map(inject));

    // 2. Wire up everything that depends on the injected markup.
    highlightActiveLinks();
    initMobileMenu();
    initTheme();
    initScrollEffects();
    updateCartCount();

    if (!bound.storage) {
      bound.storage = true;
      window.addEventListener('storage', (event) => {
        if (event.key === 'cm-shop-cart') updateCartCount();
      });
    }

    initLiveChat();

    const year = document.getElementById('footer-year');
    if (year) year.textContent = new Date().getFullYear();

    // 3. Render icons inside injected HTML.
    if (window.lucide) lucide.createIcons();

    // 4. Tell the rest of the page the navbar/footer are ready.
    //    session.js listens for this so it can apply auth state to
    //    [data-auth="guest"|"user"] blocks that didn't exist before now.
    document.dispatchEvent(new CustomEvent('layout:ready', {
      detail: { navbar: navbarHost, footer: footerHost }
    }));
  });
})();