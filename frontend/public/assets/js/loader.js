/* ═══════════════════════════════════════════════════════════════
   ComboMaster Loader — reusable loading system
   Drop-in: adds <link> CSS + auto-inject DOM + exposes window.Loader

   Usage:
     Loader.showTop()                    // top progress bar
     Loader.hideTop()
     Loader.button(btn, true, 'Saving…') // button spinner
     Loader.button(btn, false)
     Loader.skeleton(hostEl, { rows: 3, height: 52 })
     Loader.skeletonChart(canvasEl, true)   // show overlay
     Loader.skeletonChart(canvasEl, false)  // hide
     Loader.statCards(['id1', 'id2'])       // shimmer on stat-val
     Loader.clearStatCards()
     Loader.wrap(promise)                // auto top-loader around a promise
     Loader.page()                       // full-screen blocking loader
     Loader.hidePage()
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.Loader) return; // already installed

  /* ─── 1. Inject CSS once ─────────────────────────────── */
  const CSS = `
    .top-loader{position:fixed;top:0;left:0;right:0;height:3px;z-index:9998;pointer-events:none;background:transparent;overflow:hidden;opacity:0;transition:opacity .2s}
    .top-loader.active{opacity:1}
    .top-loader::before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,var(--c-amber,#facc15),var(--c-orange,#fb923c),var(--c-pink,#f472b6),var(--c-amber,#facc15));background-size:200% 100%;transform-origin:left;animation:topLoaderGrow 2s cubic-bezier(.1,.7,.3,1) forwards,topLoaderShimmer 1.4s linear infinite}
    @keyframes topLoaderGrow{0%{transform:scaleX(0)}100%{transform:scaleX(.85)}}
    @keyframes topLoaderShimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}

    .skeleton-line{background:linear-gradient(90deg,rgba(255,255,255,.05) 25%,rgba(255,255,255,.12) 37%,rgba(255,255,255,.05) 63%);background-size:400% 100%;animation:skeletonShimmer 1.4s ease-in-out infinite;border-radius:.5rem;display:inline-block}
    .skeleton-circle{background:linear-gradient(90deg,rgba(255,255,255,.05) 25%,rgba(255,255,255,.12) 37%,rgba(255,255,255,.05) 63%);background-size:400% 100%;animation:skeletonShimmer 1.4s ease-in-out infinite;border-radius:9999px}
    .skeleton-row{height:52px;border-radius:.75rem;background:linear-gradient(90deg,rgba(255,255,255,.03) 25%,rgba(255,255,255,.08) 37%,rgba(255,255,255,.03) 63%);background-size:400% 100%;animation:skeletonShimmer 1.4s ease-in-out infinite;margin-bottom:.5rem}
    body.light-theme .skeleton-line,body.light-theme .skeleton-circle{background:linear-gradient(90deg,rgba(0,0,0,.05) 25%,rgba(0,0,0,.1) 37%,rgba(0,0,0,.05) 63%);background-size:400% 100%}
    body.light-theme .skeleton-row{background:linear-gradient(90deg,rgba(0,0,0,.03) 25%,rgba(0,0,0,.06) 37%,rgba(0,0,0,.03) 63%);background-size:400% 100%}
    @keyframes skeletonShimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}

    .spinner{width:18px;height:18px;border:2px solid rgba(250,204,21,.25);border-top-color:var(--gold,#facc15);border-radius:50%;animation:spin .7s linear infinite;display:inline-block;vertical-align:middle}
    .spinner.big{width:36px;height:36px;border-width:3px}
    @keyframes spin{to{transform:rotate(360deg)}}

    .chart-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:var(--bg-card,rgba(22,28,42,.72));border-radius:1.25rem;z-index:2;backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px)}

    .btn-spinner{width:14px;height:14px;border:2px solid rgba(26,18,0,.3);border-top-color:#1a1200;border-radius:50%;animation:spin .7s linear infinite;display:inline-block;vertical-align:middle;margin-right:.4rem}
    body.light-theme .btn-spinner{border-color:rgba(255,255,255,.4);border-top-color:#ffffff}

    .stat-card.loading .stat-val{color:transparent!important;position:relative}
    .stat-card.loading .stat-val::after{content:'';position:absolute;left:0;top:30%;width:60%;height:1.4rem;border-radius:.4rem;background:linear-gradient(90deg,rgba(255,255,255,.06) 25%,rgba(255,255,255,.14) 37%,rgba(255,255,255,.06) 63%);background-size:400% 100%;animation:skeletonShimmer 1.4s ease-in-out infinite}
    body.light-theme .stat-card.loading .stat-val::after{background:linear-gradient(90deg,rgba(0,0,0,.05) 25%,rgba(0,0,0,.1) 37%,rgba(0,0,0,.05) 63%);background-size:400% 100%}

    .loader-page{position:fixed;inset:0;z-index:99999;background:rgba(7,9,16,.85);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1rem;opacity:0;pointer-events:none;transition:opacity .25s}
    body.light-theme .loader-page{background:rgba(244,247,252,.85)}
    .loader-page.active{opacity:1;pointer-events:auto}
    .loader-page-msg{font-size:.85rem;color:var(--text-muted,#8ea3c0);font-weight:500}
  `;

  if (!document.getElementById('cm-loader-css')) {
    const style = document.createElement('style');
    style.id = 'cm-loader-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /* ─── 2. DOM helpers ────────────────────────────────── */
  function ensureTopBar() {
    let bar = document.getElementById('topLoader');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'topLoader';
      bar.className = 'top-loader';
      document.body.prepend(bar);
    }
    return bar;
  }

  function ensurePageLoader() {
    let el = document.getElementById('cmPageLoader');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cmPageLoader';
      el.className = 'loader-page';
      el.innerHTML = `
        <div class="spinner big" style="border-color:rgba(250,204,21,.2);border-top-color:var(--gold,#facc15)"></div>
        <div class="loader-page-msg" id="cmPageLoaderMsg">Loading…</div>
      `;
      document.body.appendChild(el);
    }
    return el;
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  let topBarTimer = null;

  /* ─── 3. Public API ─────────────────────────────────── */
  const Loader = {

    /* Top progress bar */
    showTop() {
      const bar = ensureTopBar();
      bar.classList.add('active');
      // reset animation so each call replays the sweep
      bar.style.animation = 'none';
      void bar.offsetHeight;
      bar.style.animation = '';
      clearTimeout(topBarTimer);
    },
    hideTop() {
      const bar = document.getElementById('topLoader');
      if (!bar) return;
      topBarTimer = setTimeout(() => bar.classList.remove('active'), 120);
    },

    /* Button spinner */
    button(btn, isLoading, loadingText) {
      if (!btn) return;
      if (isLoading) {
        if (!btn.dataset.loaderOriginal) btn.dataset.loaderOriginal = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<span class="btn-spinner"></span>${esc(loadingText || 'Loading…')}`;
      } else {
        btn.disabled = false;
        if (btn.dataset.loaderOriginal) {
          btn.innerHTML = btn.dataset.loaderOriginal;
          delete btn.dataset.loaderOriginal;
        }
      }
    },

    /* List skeleton */
    skeleton(hostOrId, opts = {}) {
      const host = typeof hostOrId === 'string' ? document.getElementById(hostOrId) : hostOrId;
      if (!host) return;
      const rows = Math.max(1, Number(opts.rows) || 3);
      const height = Number(opts.height) || 52;
      host.innerHTML = Array.from({ length: rows }).map(
        () => `<div class="skeleton-row" style="height:${height}px"></div>`
      ).join('');
    },

    /* Chart overlay spinner */
    skeletonChart(canvasOrId, show = true) {
      const canvas = typeof canvasOrId === 'string' ? document.getElementById(canvasOrId) : canvasOrId;
      if (!canvas) return;
      const parent = canvas.parentElement;
      if (!parent) return;
      parent.style.position = 'relative';
      if (show) {
        if (parent.querySelector('.chart-loading')) return;
        const overlay = document.createElement('div');
        overlay.className = 'chart-loading';
        overlay.innerHTML = `<div class="spinner big"></div>`;
        parent.appendChild(overlay);
      } else {
        parent.querySelector('.chart-loading')?.remove();
      }
    },

    /* Stat cards shimmer */
    statCards(ids) {
      (ids || []).forEach(id => {
        document.getElementById(id)?.closest('.stat-card')?.classList.add('loading');
      });
    },
    clearStatCards() {
      document.querySelectorAll('.stat-card.loading').forEach(el => el.classList.remove('loading'));
    },

    /* Wrap a promise with top-loader */
    async wrap(promise) {
      this.showTop();
      try { return await promise; }
      finally { this.hideTop(); }
    },

    /* Full-screen blocking loader */
    page(msg) {
      const el = ensurePageLoader();
      const m = document.getElementById('cmPageLoaderMsg');
      if (m) m.textContent = msg || 'Loading…';
      el.classList.add('active');
    },
    hidePage() {
      document.getElementById('cmPageLoader')?.classList.remove('active');
    },

    /* Spin a specific element in place (e.g. theme toggle) */
    inline(el, size = 18) {
      if (!el) return () => { };
      const original = el.innerHTML;
      el.innerHTML = `<span class="spinner" style="width:${size}px;height:${size}px"></span>`;
      return () => { el.innerHTML = original; };
    }
  };

  window.Loader = Loader;
})();