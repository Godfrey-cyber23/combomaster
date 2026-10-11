/* ============================================================
   ComboMaster — Shared Layout Loader (navbar + footer)
   ============================================================ */
(function () {
  const COMPONENTS = [
    { target: 'site-navbar', file: '../public/components/navbar.html' },
    { target: 'site-footer', file: '../public/components/footer.html' },
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

  /* ---- Nav shadow + keep nav below the urgency bar until scrolled ---- */
  function initScrollEffects() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;
    const urgency = document.querySelector('.urgency-bar');
    const urgencyH = urgency ? urgency.offsetHeight : 0;

    const update = () => {
      const y = window.scrollY;
      navbar.classList.toggle('nav-scrolled', y > 24);
      if (urgency) navbar.style.top = `${Math.max(0, urgencyH - y)}px`;
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
    const year = document.getElementById('footer-year');
    if (year) year.textContent = new Date().getFullYear();
    if (window.lucide) lucide.createIcons();   // render icons inside injected HTML
  });
})();