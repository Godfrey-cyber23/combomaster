// assets/js/session.js
// Runs on every page. Knows whether the visitor is logged in.
(function () {
  'use strict';

  // Versioned so a stale v1 cache is discarded on deploy.
  var CACHE_KEY = 'combo.session.user.v2';
  var CACHE_TTL = 60 * 1000; // 60 seconds

  // Guards so DOMContentLoaded + layout:ready (or any future triggers)
  // can't cause the boot logic to run twice, and so logout handlers
  // are never double-bound.
  var booted = false;
  var logoutBound = new WeakSet();

  /* ---------- cache ---------- */
  function readCache() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.at) return null;
      if (Date.now() - parsed.at > CACHE_TTL) return null;
      return parsed.user;
    } catch (_) { return null; }
  }

  function writeCache(user) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ user: user, at: Date.now() }));
    } catch (_) { /* ignore quota errors */ }
  }

  function clearCache() {
    try { sessionStorage.removeItem(CACHE_KEY); } catch (_) {}
  }

  /* ---------- network ---------- */
  async function fetchMe() {
    try {
      var response = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' }
      });
      if (response.status === 401) return { user: null };
      if (!response.ok) return { user: null };
      var data = await response.json();
      return { user: data.user || null };
    } catch (_) {
      return { user: null };
    }
  }

  /* ---------- DOM ---------- */
  function dashboardHref(user) {
    if (!user) return 'login.html';
    return user.role === 'admin' ? 'admin-dashboard.html' : 'client-dashboard.html';
  }

  function bindLogoutHandlers() {
    document.querySelectorAll('[data-logout]').forEach(function (el) {
      if (logoutBound.has(el)) return;
      logoutBound.add(el);

      el.addEventListener('click', async function (event) {
        event.preventDefault();
        try {
          await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
          });
        } catch (_) { /* ignore */ }
        clearCache();
        window.location.href = 'login.html';
      });
    });
  }

  function applyToDom(user) {
    var isLoggedIn = !!(user && user.id);

    // Show/hide guest vs user blocks.
    document.querySelectorAll('[data-auth="guest"]').forEach(function (el) {
      el.classList.toggle('hidden', isLoggedIn);
    });
    document.querySelectorAll('[data-auth="user"]').forEach(function (el) {
      el.classList.toggle('hidden', !isLoggedIn);
    });

    // Fill in user details.
    if (isLoggedIn) {
      document.querySelectorAll('[data-user-name]').forEach(function (el) {
        el.textContent = user.name || 'Athlete';
      });
      document.querySelectorAll('[data-user-email]').forEach(function (el) {
        el.textContent = user.email || '';
      });
      document.querySelectorAll('[data-dashboard-link]').forEach(function (el) {
        el.setAttribute('href', dashboardHref(user));
      });
    }

    bindLogoutHandlers();

    document.dispatchEvent(new CustomEvent('session:ready', { detail: { user: user } }));
  }

  /* ---------- public API ---------- */
  window.ComboSession = {
    user: null,

    isLoggedIn: function () {
      return !!(this.user && this.user.id);
    },

    refresh: async function () {
      var result = await fetchMe();
      this.user = result.user;
      writeCache(result.user);
      applyToDom(result.user);
      return result.user;
    },

    clear: function () {
      this.user = null;
      clearCache();
      applyToDom(null);
    }
  };

  /* ---------- boot ---------- */
  async function boot() {
    if (booted) return;
    booted = true;

    var cached = readCache();
    if (cached !== null) {
      // Fast path: paint from cache, refresh in background.
      window.ComboSession.user = cached;
      applyToDom(cached);

      var fresh = await fetchMe();
      window.ComboSession.user = fresh.user;
      writeCache(fresh.user);
      applyToDom(fresh.user);
    } else {
      var result = await fetchMe();
      window.ComboSession.user = result.user;
      writeCache(result.user);
      applyToDom(result.user);
    }
  }

  // Fire on whichever comes first. layout.js dispatches layout:ready
  // after injecting the navbar/footer, so this is the reliable trigger
  // when the [data-auth] blocks are inside an injected partial.
  document.addEventListener('DOMContentLoaded', boot);
  document.addEventListener('layout:ready', boot);
})();