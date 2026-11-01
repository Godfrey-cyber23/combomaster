// assets/js/api.js
(function () {
  'use strict';

  const page = (location.pathname.split('/').pop() || '').toLowerCase();

  /* ============================================================
     SHARED FETCH WRAPPER
     ============================================================ */
  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');

    const response = await fetch(`/api${path}`, {
      ...options,
      headers,
      credentials: 'same-origin',
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });

    if (response.status === 204) return null;

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      throw new Error(
        'The API returned a web page instead of JSON. Configure your host so /api routes to the ComboMaster backend.'
      );
    }

    let data;
    try {
      data = await response.json();
    } catch (_) {
      throw new Error('The server returned an invalid response');
    }

    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status})`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  // Expose for the dashboard files
  window.API = window.API || {};
  window.API.request = request;

  /* ============================================================
     TOAST — delegates to page's showToast if present
     ============================================================ */
  function toast(message, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }
    const host = document.getElementById('toast');
    const text = document.getElementById('toast-message');
    if (host && text) {
      text.textContent = message;
      host.classList.add('show');
      window.setTimeout(() => host.classList.remove('show'), 3500);
    } else {
      window.alert(message);
    }
  }

  /* ============================================================
     AUTH FORM: LOGIN
     ============================================================ */
  function bindLoginForm() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();

      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      // Let the page's own validation run first (it defines these helpers).
      if (typeof window.validateLoginForm === 'function' && !window.validateLoginForm()) {
        document.querySelector('.form-input.input-error')?.focus();
        return;
      }

      if (typeof window.setLoginLoading === 'function') window.setLoginLoading(true);

      try {
        const { user, message } = await request('/auth/login', {
          method: 'POST',
          body: { email, password }
        });

        if (window.ComboSession) window.ComboSession.clear();
        toast(message || 'Signed in successfully');
        window.location.replace(
          user.role === 'admin' ? 'admin-dashboard.html' : 'client-dashboard.html'
        );
      } catch (error) {
        // Surface validation-style errors on the right field
        if (error.status === 401 || error.status === 400) {
          if (typeof window.showLoginFieldError === 'function') {
            window.showLoginFieldError('password', error.message);
          }
        }
        toast(error.message, 'error');
        if (typeof window.setLoginLoading === 'function') window.setLoginLoading(false);
      }
    }, true);
  }

  /* ============================================================
     AUTH FORM: SIGNUP
     ============================================================ */
  function bindSignupForm() {
    const form = document.getElementById('signupForm');
    if (!form) return;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();

      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;

      if (password !== confirmPassword) {
        if (typeof window.showFieldError === 'function') {
          window.showFieldError('confirmPassword', 'Passwords do not match.');
        }
        toast('Passwords do not match', 'error');
        return;
      }

      if (typeof window.setLoading === 'function') window.setLoading(true);

      try {
        await request('/auth/register', {
          method: 'POST',
          body: {
            name: document.getElementById('fullName').value.trim(),
            email: document.getElementById('email').value.trim(),
            password
          }
        });

        if (window.ComboSession) window.ComboSession.clear();
        toast('Account created. Signing you in…');
        window.location.replace('client-dashboard.html');
      } catch (error) {
        // Map common server errors to fields
        if (typeof window.showFieldError === 'function') {
          if (/email/i.test(error.message) && /exist|taken|registered/i.test(error.message)) {
            window.showFieldError('email', error.message);
          }
        }
        toast(error.message, 'error');
        if (typeof window.setLoading === 'function') window.setLoading(false);
      }
    }, true);
  }

  /* ============================================================
     AUTH FORM: FORGOT PASSWORD
     ============================================================ */
  function bindForgotPasswordForm() {
    const form = document.getElementById('resetForm');
    if (!form) return;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();

      const email = document.getElementById('email').value.trim();

      if (typeof window.validateEmail === 'function') {
        const ok = window.validateEmail();
        if (!ok) {
          document.getElementById('email')?.focus();
          return;
        }
      }

      if (typeof window.setResetLoading === 'function') window.setResetLoading(true);

      try {
        const { message } = await request('/auth/forgot-password', {
          method: 'POST',
          body: { email }
        });

        toast(message || 'If that email exists, a reset link has been sent.');

        // Show success card if the page has one
        const resetCard = document.getElementById('reset-card');
        const successCard = document.getElementById('success-card');
        const sentEmail = document.getElementById('sent-email');
        if (sentEmail) sentEmail.textContent = email;
        if (resetCard) resetCard.classList.add('hidden');
        if (successCard) successCard.classList.remove('hidden');
      } catch (error) {
        toast(error.message, 'error');
        if (typeof window.showEmailError === 'function') window.showEmailError(error.message);
      } finally {
        if (typeof window.setResetLoading === 'function') window.setResetLoading(false);
      }
    }, true);
  }

  /* ============================================================
     AUTH FORM: RESET PASSWORD
     ============================================================ */
  function bindResetPasswordForm() {
    const form = document.getElementById('resetForm');
    // Only run if this is the reset-password page (has token input)
    if (!form || !document.getElementById('token')) return;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();

      const token = document.getElementById('token').value;
      const password = document.getElementById('password').value;

      if (typeof window.setLoading === 'function') window.setLoading(true);

      try {
        const { message } = await request('/auth/reset-password', {
          method: 'POST',
          body: { token, password }
        });

        toast(message || 'Password updated');
        window.location.replace('login.html');
      } catch (error) {
        toast(error.message, 'error');
        if (typeof window.setLoading === 'function') window.setLoading(false);
      }
    }, true);
  }

  /* ============================================================
     DASHBOARD GUARD
     The full dashboard rendering lives in each dashboard file.
     api.js only verifies the session and role before the page's
     own inline script starts rendering.
     ============================================================ */
  async function guardDashboard(requiredRole) {
    if (!requiredRole) return;

    let user;
    try {
      ({ user } = await request('/auth/me'));
    } catch (error) {
      if (error.status === 401) {
        window.location.replace('login.html');
        return;
      }
      throw error;
    }

    if (user.role !== requiredRole) {
      window.location.replace(
        user.role === 'admin' ? 'admin-dashboard.html' : 'client-dashboard.html'
      );
      return;
    }

    // Expose the user so the dashboard's inline script can consume it
    // without making a second /auth/me call.
    window.currentUser = user;
    if (window.ComboSession) {
      window.ComboSession.user = user;
    }

    document.dispatchEvent(new CustomEvent('dashboard:ready', { detail: { user } }));
  }

  /* ============================================================
     LOGOUT HELPERS (used by sidebar buttons on dashboards)
     ============================================================ */
  window.logoutClient = window.logoutClient || async function () {
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch (_) { /* ignore — still redirect */ }
    if (window.ComboSession) window.ComboSession.clear();
    window.location.replace('login.html');
  };

  window.logoutAdmin = window.logoutAdmin || async function () {
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch (_) { /* ignore — still redirect */ }
    if (window.ComboSession) window.ComboSession.clear();
    window.location.replace('login.html');
  };

  /* ============================================================
     BOOT
     ============================================================ */
  document.addEventListener('DOMContentLoaded', () => {
    bindLoginForm();
    bindSignupForm();
    bindForgotPasswordForm();
    bindResetPasswordForm();

    if (page === 'client-dashboard.html') {
      guardDashboard('client').catch((error) => toast(error.message, 'error'));
    } else if (page === 'admin-dashboard.html') {
      guardDashboard('admin').catch((error) => toast(error.message, 'error'));
    }
  });

  // Public surface for advanced use
  window.API.toast = toast;
})();