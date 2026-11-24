/* ═══════════════════════════════════════════════════════════
   ComboMaster Admin Dashboard — main controller
   Depends on: window.API (api.js), window.Loader (loader.js),
               window.ComboMessaging (admin-messaging.js)
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const state = {
    user: null,
    stats: {},
    revenueSeries: [],
    recentBookings: [],
    clients: [],
    bookings: [],
    unreadByClient: {},
    charts: { revenue: null },
    loaded: { dashboard: false, clients: false, bookings: false, messages: false, settings: false },
    booted: false,
    refreshTimer: null
  };

  /* ─── helpers ─────────────────────────────── */
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtDate = d => { try { return new Date(d).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}); } catch { return ''; } };
  const fmtTime = d => { try { return new Date(d).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}); } catch { return ''; } };
  const fmtRelative = d => {
    if (!d) return '—';
    const diff = Date.now() - new Date(d).getTime();
    if (Number.isNaN(diff)) return '—';
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff/60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff/3_600_000)}h ago`;
    if (diff < 604_800_000) return `${Math.floor(diff/86_400_000)}d ago`;
    return fmtDate(d);
  };

  async function apiCall(path, options = {}) {
    if (!window.API || typeof window.API.request !== 'function') {
      throw new Error('API not ready — assets/js/api.js failed to load');
    }
    return window.API.request(path, options);
  }

  /* ─── toast ──────────────────────────────── */
  const TOAST_ICONS = { success: 'check-circle', error: 'alert-circle', warning: 'alert-triangle', info: 'info' };
  const TOAST_TITLES = { success: 'Success', error: 'Error', warning: 'Heads up', info: 'Notice' };

  function toast(message, type = 'success', opts = {}) {
    const stack = $('toastStack');
    if (!stack) return;
    const kind = TOAST_ICONS[type] ? type : 'success';
    const title = opts.title || TOAST_TITLES[kind];
    const duration = Math.max(1500, Number(opts.duration) || 4000);
    const item = document.createElement('div');
    item.className = `toast-item ${kind}`;
    item.style.setProperty('--toast-dur', duration + 'ms');
    item.innerHTML = `
      <div class="toast-ico"><i data-lucide="${TOAST_ICONS[kind]}" class="w-5 h-5"></i></div>
      <div class="toast-body">
        <div class="toast-title">${esc(title)}</div>
        <div class="toast-msg">${esc(message)}</div>
      </div>
      <button class="toast-close" aria-label="Dismiss"><i data-lucide="x" class="w-4 h-4"></i></button>
      <div class="toast-progress"></div>`;
    stack.appendChild(item);
    if (window.lucide) lucide.createIcons();
    const remove = () => { item.classList.add('hide'); setTimeout(() => item.remove(), 300); };
    item.querySelector('.toast-close')?.addEventListener('click', remove);
    const timer = setTimeout(remove, duration);
    item.addEventListener('mouseenter', () => { clearTimeout(timer); item.querySelector('.toast-progress').style.animationPlayState = 'paused'; });
    item.addEventListener('mouseleave', () => item.querySelector('.toast-progress').style.animationPlayState = 'running');
    requestAnimationFrame(() => item.classList.add('show'));
    const all = stack.querySelectorAll('.toast-item');
    if (all.length > 4) all[0].remove();
  }
  window.showToast = toast;

  /* ─── modal + confirm ─────────────────────── */
  function openModal(title, html, opts = {}) {
    $('modalTitle').innerHTML = title;
    $('modalBody').innerHTML = html;
    const header = $('modalHeader');
    header.style.display = opts.hideHeader ? 'none' : 'flex';
    $('globalModal').classList.add('active');
    if (window.lucide) lucide.createIcons();
    setTimeout(() => { const f = $('modalBody').querySelector('input,select,textarea'); if (f) f.focus(); }, 60);
  }
  function closeModal() { $('globalModal').classList.remove('active'); }
  window.openModal = openModal;
  window.closeModal = closeModal;

  function showConfirm(opts = {}) {
    return new Promise(resolve => {
      const variant = opts.variant || 'danger';
      const icon = opts.icon || (variant === 'danger' ? 'alert-triangle' : variant === 'warning' ? 'alert-circle' : 'info');
      const confirmText = opts.confirmText || 'Confirm';
      const cancelText = opts.cancelText || 'Cancel';
      const html = `
        <div>
          <div class="confirm-ico-wrap ${variant}"><i data-lucide="${icon}" class="w-7 h-7"></i></div>
          <div class="confirm-title">${esc(opts.title || 'Are you sure?')}</div>
          <div class="confirm-msg">${opts.message || ''}</div>
          <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button class="btn-neutral px-4 py-2 rounded-xl text-sm w-full sm:w-auto" data-act="cancel">${esc(cancelText)}</button>
            <button class="btn-${variant === 'info' ? 'gold' : 'danger'} px-4 py-2 rounded-xl text-sm w-full sm:w-auto" data-act="ok">${esc(confirmText)}</button>
          </div>
        </div>`;
      openModal('Confirm', html, { hideHeader: true });
      const modal = $('globalModal');
      const okBtn = $('modalBody').querySelector('[data-act="ok"]');
      const cancelBtn = $('modalBody').querySelector('[data-act="cancel"]');
      let settled = false;
      const finish = v => { if (settled) return; settled = true; closeModal(); resolve(v); };
      okBtn.addEventListener('click', () => finish(true));
      cancelBtn.addEventListener('click', () => finish(false));
      const outside = e => { if (e.target === modal) { modal.removeEventListener('click', outside); finish(false); } };
      modal.addEventListener('click', outside);
      const escHandler = e => { if (e.key === 'Escape') { document.removeEventListener('keydown', escHandler); finish(false); } };
      document.addEventListener('keydown', escHandler);
    });
  }
  window.showConfirm = showConfirm;

  /* ─── theme ──────────────────────────────── */
  window.toggleAdminTheme = function () {
    const btn = document.querySelector('header button[onclick="toggleAdminTheme()"]');
    if (btn) btn.innerHTML = '<span class="spinner" style="width:16px;height:16px"></span>';
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    localStorage.setItem('adminTheme', isLight ? 'light' : 'dark');
    requestAnimationFrame(() => {
      if (btn) btn.innerHTML = `<i data-lucide="${isLight ? 'sun' : 'moon'}" id="themeIcon" class="w-5 h-5"></i>`;
      if (window.lucide) lucide.createIcons();
      if (state.loaded.dashboard) renderRevenueChart();
    });
  };

  function loadTheme() {
    if (localStorage.getItem('adminTheme') === 'light') {
      document.body.classList.add('light-theme');
      $('themeIcon')?.setAttribute('data-lucide', 'sun');
    }
    if (window.lucide) lucide.createIcons();
  }

  /* ─── navigation ──────────────────────────── */
  const SECTION_TITLES = { dashboard:'Dashboard', clients:'Clients', bookings:'Bookings', messages:'Messages', settings:'Settings' };
  const SECTION_VIEWS = { dashboard:'dashboardView', clients:'clientsView', bookings:'bookingsView', messages:'messagesView', settings:'settingsView' };

  function switchSection(section) {
    document.querySelectorAll('.view-pane').forEach(p => p.classList.remove('active-view'));
    const view = SECTION_VIEWS[section];
    if (view) $(view)?.classList.add('active-view');
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    document.querySelector(`.sidebar-link[data-section="${section}"]`)?.classList.add('active');
    $('sectionTitle').textContent = SECTION_TITLES[section] || 'Admin';
    closeMobileSidebar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (!state.loaded[section]) {
      if (section === 'dashboard') loadDashboard();
      if (section === 'clients') loadClients();
      if (section === 'bookings') loadBookings();
      if (section === 'messages') loadMessages();
      if (section === 'settings') loadSettings();
    }
  }

  function initNav() {
    document.querySelectorAll('.sidebar-link[data-section]').forEach(link => {
      link.addEventListener('click', e => { e.preventDefault(); switchSection(link.dataset.section); });
    });
    $('mobileMenuBtn')?.addEventListener('click', e => {
      e.stopPropagation();
      $('adminSidebar').classList.toggle('mobile-open');
    });
    document.addEventListener('click', e => {
      const s = $('adminSidebar');
      if (window.innerWidth >= 1025) return;
      if (!s.classList.contains('mobile-open')) return;
      if (s.contains(e.target)) return;
      if (e.target === $('mobileMenuBtn') || $('mobileMenuBtn')?.contains(e.target)) return;
      closeMobileSidebar();
    });
  }
  function closeMobileSidebar() { $('adminSidebar').classList.remove('mobile-open'); }

  /* ─── logout ──────────────────────────────── */
  async function doLogout() {
    const ok = await showConfirm({
      title: 'Sign out?',
      message: 'You will be returned to the login page.',
      confirmText: 'Sign out',
      cancelText: 'Stay signed in',
      variant: 'warning',
      icon: 'log-out'
    });
    if (!ok) return;
    if (window.Loader) Loader.page('Signing you out…');
    try {
      if (typeof window.logoutAdmin === 'function') await window.logoutAdmin();
      else { try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch {} window.location.replace('login.html'); }
    } catch { window.location.replace('login.html'); }
  }
  window.doLogout = doLogout;

  /* ═══════════════════════════════════════════
     DASHBOARD
     ═══════════════════════════════════════════ */
  async function loadDashboard() {
    if (window.Loader) Loader.showTop();
    if (window.Loader) {
      Loader.skeleton('recentBookingsList', { rows: 3, height: 44 });
      Loader.statCards(['statRevenue', 'statClients', 'statPendingBookings', 'statUnreadMessages']);
      Loader.skeletonChart('revenueChart', true);
    }
    try {
      const data = await apiCall('/admin/dashboard');
      state.stats = data.stats || {};
      state.revenueSeries = data.revenueSeries || [];
      state.recentBookings = data.recentBookings || [];
      renderStats();
      renderRevenueChart();
      renderRecentBookings();
      state.loaded.dashboard = true;
    } catch (err) {
      if (err.status === 401) return location.replace('login.html');
      toast(err.message || 'Could not load dashboard', 'error');
    } finally {
      if (window.Loader) {
        Loader.hideTop();
        Loader.clearStatCards();
        Loader.skeletonChart('revenueChart', false);
      }
    }
  }

  function renderStats() {
    const s = state.stats;
    const setTxt = (id, val) => { const el = $(id); if (el) el.textContent = val; };
    setTxt('statRevenue', `$${Number(s.totalRevenue || 0).toLocaleString()}`);
    setTxt('statClients', s.activeClients ?? s.clients ?? 0);
    setTxt('statPendingBookings', s.pendingBookings ?? 0);
    setTxt('statUnreadMessages', s.messagesToday ?? 0);
  }

  function renderRevenueChart() {
    const canvas = $('revenueChart');
    if (!canvas || !window.Chart) return;
    if (state.charts.revenue) state.charts.revenue.destroy();
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || 180);
    grad.addColorStop(0, 'rgba(245,158,11,.35)');
    grad.addColorStop(1, 'rgba(245,158,11,0)');
    state.charts.revenue = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'],
        datasets: [{
          label: 'Revenue ($)',
          data: state.revenueSeries,
          borderColor: 'rgba(245,158,11,1)',
          backgroundColor: grad,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: 'rgba(245,158,11,1)',
          pointBorderColor: 'rgba(255,255,255,.9)',
          pointBorderWidth: 2,
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0f172a', padding: 10, cornerRadius: 8 } },
        scales: {
          y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,.05)' } },
          x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { display: false } }
        }
      }
    });
  }

  function renderRecentBookings() {
    const host = $('recentBookingsList');
    if (!host) return;
    if (!state.recentBookings.length) {
      host.innerHTML = `<div class="empty-state"><i data-lucide="calendar"></i><span>No bookings yet.</span></div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }
    host.innerHTML = state.recentBookings.map(b => {
      const cls = b.status === 'approved' ? 'badge-green'
        : b.status === 'declined' ? 'badge-red'
          : b.status === 'cancelled' ? 'badge-gray' : 'badge-gold';
      return `
        <div class="flex items-center justify-between gap-2 p-2 rounded-lg" style="background:var(--bg-secondary)">
          <div class="min-w-0">
            <p class="font-medium truncate">${esc(b.clientName)}</p>
            <p class="text-xs" style="color:var(--text-muted)">${esc(b.service)} · ${fmtDate(b.requested_at)} ${fmtTime(b.requested_at)}</p>
          </div>
          <span class="badge ${cls}">${esc(b.status)}</span>
        </div>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
  }

  /* ═══════════════════════════════════════════
     CLIENTS
     ═══════════════════════════════════════════ */
  async function loadClients() {
    if (window.Loader) Loader.showTop();
    const tbody = $('clientListTbody');
    if (tbody) tbody.innerHTML = Array.from({ length: 3 }).map(() =>
      `<tr><td colspan="6"><div class="skeleton-row" style="height:44px;border-radius:.5rem;background:rgba(255,255,255,.05)"></div></td></tr>`
    ).join('');
    try {
      const data = await apiCall('/admin/clients');
      state.clients = data.clients || [];
      renderClients();
      state.loaded.clients = true;
    } catch (err) {
      if (err.status === 401) return location.replace('login.html');
      toast(err.message || 'Could not load clients', 'error');
    } finally {
      if (window.Loader) Loader.hideTop();
    }
  }

  function renderClients() {
    const tbody = $('clientListTbody');
    if (!tbody) return;
    const q = ($('clientSearch')?.value || '').toLowerCase().trim();
    const filtered = state.clients.filter(c =>
      !q || c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
    );
    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i data-lucide="users"></i><span>No clients found.</span></div></td></tr>`;
      if (window.lucide) lucide.createIcons();
      return;
    }
    tbody.innerHTML = filtered.map(c => `
      <tr>
        <td class="font-medium">${esc(c.name || '—')}</td>
        <td style="color:var(--text-muted)">${esc(c.email || '—')}</td>
        <td>${esc(c.goal || '—')}</td>
        <td>${c.latestWeightKg != null ? esc(c.latestWeightKg) + ' kg' : '—'}</td>
        <td style="color:var(--text-muted)">${fmtRelative(c.lastActivity)}</td>
        <td><button class="text-gold text-xs hover:underline" onclick="openClientDetail(${c.id})">View</button></td>
      </tr>`).join('');
    if (window.lucide) lucide.createIcons();
  }
  window.renderClients = renderClients;

  window.openClientDetail = async function (userId) {
    openModal('Client details', `<div class="empty-state"><div class="spinner big"></div><span>Loading…</span></div>`);
    try {
      const data = await apiCall('/admin/clients/' + encodeURIComponent(userId));
      const c = data.client || {};
      const html = `
        <div class="space-y-4">
          <div>
            <h3 class="font-display text-xl font-bold text-gold">${esc(c.name)}</h3>
            <p class="text-xs" style="color:var(--text-muted)">${esc(c.email)}</p>
          </div>
          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="p-2 rounded-lg" style="background:var(--bg-secondary)">
              <p class="text-xs" style="color:var(--text-muted)">Meals</p>
              <p class="font-display text-xl font-bold text-gold">${data.meals.length}</p>
            </div>
            <div class="p-2 rounded-lg" style="background:var(--bg-secondary)">
              <p class="text-xs" style="color:var(--text-muted)">Workouts</p>
              <p class="font-display text-xl font-bold text-gold">${data.workouts.length}</p>
            </div>
            <div class="p-2 rounded-lg" style="background:var(--bg-secondary)">
              <p class="text-xs" style="color:var(--text-muted)">Weigh-ins</p>
              <p class="font-display text-xl font-bold text-gold">${data.progress.length}</p>
            </div>
          </div>
          <div>
            <h4 class="font-semibold mb-1">Recent workouts <span class="text-xs" style="color:var(--text-muted)">(click pencil to edit)</span></h4>
            ${data.workouts.length
              ? data.workouts.slice(0, 8).map(w => `
                <div class="flex justify-between items-center text-sm p-1.5 rounded mb-1" style="background:var(--bg-secondary)">
                  <span class="truncate">${esc(w.workout_name)} · ${w.duration_minutes || 0} min · ${fmtDate(w.completed_at)}</span>
                  <button class="icon-btn" onclick="editWorkout(${w.id})" title="Edit"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
                </div>`).join('')
              : '<p class="text-xs" style="color:var(--text-muted)">None yet.</p>'}
          </div>
          <div>
            <h4 class="font-semibold mb-1">Recent meals <span class="text-xs" style="color:var(--text-muted)">(click pencil to edit)</span></h4>
            ${data.meals.length
              ? data.meals.slice(0, 8).map(m => `
                <div class="flex justify-between items-center text-sm p-1.5 rounded mb-1" style="background:var(--bg-secondary)">
                  <span class="truncate">${esc(m.meal_name)} · ${m.calories || 0} kcal</span>
                  <button class="icon-btn" onclick="editMeal(${m.id})" title="Edit"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
                </div>`).join('')
              : '<p class="text-xs" style="color:var(--text-muted)">None yet.</p>'}
          </div>
        </div>`;
      $('modalBody').innerHTML = html;
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      $('modalBody').innerHTML = `<p class="text-sm" style="color:var(--c-red)">${esc(err.message || 'Failed to load')}</p>`;
    }
  };

  window.editWorkout = async function (workoutId) {
    const existing = prompt('Edit workout name (leave blank to keep):');
    if (!existing) return;
    const durationStr = prompt('Duration in minutes:', '60');
    const duration = Number(durationStr);
    if (!duration || duration < 1) return;
    try {
      await apiCall('/admin/workouts/' + encodeURIComponent(workoutId), {
        method: 'PATCH',
        body: { workout_name: existing, duration_minutes: duration }
      });
      toast('Workout updated', 'success');
      // re-open client detail? Simplest: close modal and let user reopen
      closeModal();
    } catch (err) { toast(err.message || 'Could not update workout', 'error'); }
  };

  window.editMeal = async function (mealId) {
    const existing = prompt('Edit meal name (leave blank to keep):');
    if (!existing) return;
    const calStr = prompt('Calories:', '500');
    const cal = Number(calStr);
    if (Number.isNaN(cal)) return;
    try {
      await apiCall('/admin/meals/' + encodeURIComponent(mealId), {
        method: 'PATCH',
        body: { meal_name: existing, calories: cal }
      });
      toast('Meal updated', 'success');
      closeModal();
    } catch (err) { toast(err.message || 'Could not update meal', 'error'); }
  };

  /* ═══════════════════════════════════════════
     BOOKINGS
     ═══════════════════════════════════════════ */
  async function loadBookings() {
    if (window.Loader) Loader.showTop();
    const tbody = $('bookingListTbody');
    if (tbody) tbody.innerHTML = Array.from({ length: 3 }).map(() =>
      `<tr><td colspan="5"><div style="height:44px;border-radius:.5rem;background:rgba(255,255,255,.05)"></div></td></tr>`
    ).join('');
    try {
      const data = await apiCall('/admin/bookings');
      state.bookings = data.bookings || [];
      renderBookings();
      state.loaded.bookings = true;
    } catch (err) {
      if (err.status === 401) return location.replace('login.html');
      toast(err.message || 'Could not load bookings', 'error');
    } finally {
      if (window.Loader) Loader.hideTop();
    }
  }

  function renderBookings() {
    const tbody = $('bookingListTbody');
    if (!tbody) return;
    const filter = $('bookingFilter')?.value || 'all';
    const q = ($('bookingSearch')?.value || '').toLowerCase().trim();
    const filtered = state.bookings.filter(b => {
      if (filter !== 'all' && b.status !== filter) return false;
      if (q && !((b.clientName||'').toLowerCase().includes(q) || (b.service||'').toLowerCase().includes(q))) return false;
      return true;
    });
    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i data-lucide="calendar"></i><span>No ${filter === 'all' ? '' : filter} bookings.</span></div></td></tr>`;
      if (window.lucide) lucide.createIcons();
      return;
    }
    tbody.innerHTML = filtered.map(b => {
      const cls = b.status === 'approved' ? 'badge-green'
        : b.status === 'declined' ? 'badge-red'
          : b.status === 'cancelled' ? 'badge-gray' : 'badge-gold';
      const canAct = b.status === 'pending';
      return `
        <tr>
          <td class="font-medium">${esc(b.clientName || b.client_name || '—')}</td>
          <td>${esc(b.service)}</td>
          <td>${fmtDate(b.requested_at)} · ${fmtTime(b.requested_at)}</td>
          <td><span class="badge ${cls}">${esc(b.status)}</span></td>
          <td>
            ${canAct ? `
              <div class="flex gap-1">
                <button class="btn-gold px-2 py-1 rounded text-xs" onclick="approveBooking('${esc(b.id)}')">Approve</button>
                <button class="btn-danger px-2 py-1 rounded text-xs" onclick="declineBooking('${esc(b.id)}')">Decline</button>
              </div>` : '—'}
          </td>
        </tr>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
  }
  window.renderBookings = renderBookings;

  window.approveBooking = async function (id) {
    const ok = await showConfirm({
      title: 'Approve this booking?',
      message: 'The client will be notified that their session is confirmed.',
      confirmText: 'Approve', cancelText: 'Cancel', variant: 'info', icon: 'check-circle'
    });
    if (!ok) return;
    try {
      await apiCall('/admin/bookings/' + encodeURIComponent(id), { method: 'PATCH', body: { status: 'approved' } });
      toast('Booking approved', 'success');
      await loadBookings();
    } catch (err) { toast(err.message || 'Could not approve', 'error'); }
  };

  window.declineBooking = async function (id) {
    const ok = await showConfirm({
      title: 'Decline this booking?',
      message: 'The client will see this booking as declined.',
      confirmText: 'Decline', cancelText: 'Keep pending', variant: 'danger', icon: 'x-circle'
    });
    if (!ok) return;
    try {
      await apiCall('/admin/bookings/' + encodeURIComponent(id), { method: 'PATCH', body: { status: 'declined' } });
      toast('Booking declined', 'success');
      await loadBookings();
    } catch (err) { toast(err.message || 'Could not decline', 'error'); }
  };

  /* ═══════════════════════════════════════════
     MESSAGES — delegates to ComboMessaging
     ═══════════════════════════════════════════ */
  async function loadMessages() {
    if (!window.ComboMessaging) {
      toast('Messaging subsystem not loaded', 'error');
      return;
    }
    if (window.Loader) Loader.showTop();
    const host = $('msgThreadList');
    if (host) host.innerHTML = Array.from({ length: 4 }).map(() =>
      `<div style="height:60px;border-bottom:1px solid var(--border-color);padding:1rem"><div style="height:20px;background:rgba(255,255,255,.05);border-radius:.4rem"></div></div>`
    ).join('');
    try {
      const [clientsData, msgsData] = await Promise.all([
        apiCall('/admin/clients'),
        apiCall('/admin/messages').catch(() => ({ messages: [] }))
      ]);
      state.clients = clientsData.clients || [];
      // group messages per client to compute unread counts
      const unread = {};
      (msgsData.messages || []).forEach(m => {
        if (Number(m.sender_id) === Number(m.user_id)) {
          unread[m.user_id] = (unread[m.user_id] || 0) + 1;
        }
      });
      state.unreadByClient = unread;
      renderMessageThreads();
      updateUnreadBadge();
      state.loaded.messages = true;
    } catch (err) {
      if (err.status === 401) return location.replace('login.html');
      toast(err.message || 'Could not load messages', 'error');
    } finally {
      if (window.Loader) Loader.hideTop();
    }
  }

  function updateUnreadBadge() {
    const total = Object.values(state.unreadByClient).reduce((a, b) => a + b, 0);
    const badge = $('unreadBadge');
    if (badge) {
      badge.textContent = total;
      badge.style.display = total > 0 ? 'inline-flex' : 'none';
    }
  }

  function renderMessageThreads() {
    const host = $('msgThreadList');
    if (!host) return;
    const q = ($('msgSearch')?.value || '').toLowerCase().trim();
    const filtered = state.clients.filter(c =>
      !q || c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
    );
    if (!filtered.length) {
      host.innerHTML = `<div class="empty-state"><i data-lucide="users"></i><span>No clients found.</span></div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }
    host.innerHTML = filtered.map(c => {
      const unread = state.unreadByClient[c.id] || 0;
      return `
        <div class="p-4 flex justify-between items-center hover:bg-[var(--bg-secondary)] cursor-pointer border-b border-[var(--border-color)]"
             onclick="openChatThread(${c.id})">
          <div class="min-w-0">
            <p class="font-semibold truncate">${esc(c.name)}</p>
            <p class="text-xs truncate" style="color:var(--text-muted)">${esc(c.email)}</p>
          </div>
          ${unread ? `<span class="badge badge-red">${unread}</span>` : `<i data-lucide="chevron-right" class="w-4 h-4 text-gold"></i>`}
        </div>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
  }
  window.renderMessageThreads = renderMessageThreads;

  window.openChatThread = async function (userId) {
    const client = state.clients.find(c => Number(c.id) === Number(userId));
    if (window.ComboMessaging) {
      await window.ComboMessaging.openThread(userId, client);
    }
  };

  window.sendAdminMessage = function () {
    if (window.ComboMessaging) window.ComboMessaging.sendMessage();
  };
  window.handleFileSelected = function (e) {
    if (window.ComboMessaging) window.ComboMessaging.handleFileSelected(e);
  };
  window.toggleEmojiPicker = function () {
    if (window.ComboMessaging) window.ComboMessaging.toggleEmojiPicker();
  };
  window.onComposerInput = function () {
    if (window.ComboMessaging) window.ComboMessaging.onComposerInput();
  };
  window.onComposerKey = function (e) {
    if (window.ComboMessaging) window.ComboMessaging.onComposerKey(e);
  };
  window.cancelReply = function () {
    if (window.ComboMessaging) window.ComboMessaging.cancelReply();
  };
  window.toggleSound = function () {
    if (window.ComboMessaging) window.ComboMessaging.toggleSound();
  };

  /* ═══════════════════════════════════════════
     SETTINGS
     ═══════════════════════════════════════════ */
  async function loadSettings() {
    if (window.Loader) Loader.showTop();
    try {
      const { settings } = await apiCall('/admin/settings');
      $('businessName').value = settings.business_name || settings.businessName || '';
      $('contactEmail').value = settings.contact_email || settings.contactEmail || '';
      if (window.ComboMessaging) window.ComboMessaging.applySettingsToUI(settings);
      state.loaded.settings = true;
    } catch (err) {
      toast(err.message || 'Could not load settings', 'error');
    } finally {
      if (window.Loader) Loader.hideTop();
    }
  }

  window.saveSettings = async function () {
    const btn = $('saveSettingsBtn');
    const businessName = $('businessName').value.trim();
    const contactEmail = $('contactEmail').value.trim();
    if (!businessName) { toast('Business name is required', 'warning'); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const payload = {
        business_name: businessName,
        contact_email: contactEmail,
        sound_enabled: $('toggleSound')?.checked ?? true,
        typing_indicator_enabled: $('toggleTyping')?.checked ?? true,
        reactions_enabled: $('toggleReactions')?.checked ?? true,
        attachments_enabled: $('toggleAttachments')?.checked ?? true,
        read_receipts_enabled: $('toggleReceipts')?.checked ?? true
      };
      const { settings } = await apiCall('/admin/settings', { method: 'PUT', body: payload });
      if (window.ComboMessaging) window.ComboMessaging.applySettingsToUI(settings);
      toast('Settings saved', 'success');
    } catch (err) {
      toast(err.message || 'Could not save settings', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
    }
  };
  window.saveAdminSettings = window.saveSettings;

  /* ═══════════════════════════════════════════
     EXPORT
     ═══════════════════════════════════════════ */
  window.exportData = function (type, format) {
    const url = `/api/admin/export/${encodeURIComponent(type)}?format=${encodeURIComponent(format)}`;
    // fetch with credentials, then trigger download
    fetch(url, { credentials: 'same-origin' })
      .then(async res => {
        if (!res.ok) throw new Error(`Export failed (${res.status})`);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${type}-${new Date().toISOString().slice(0, 10)}.${format}`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast(`${type} exported as ${format.toUpperCase()}`, 'success');
      })
      .catch(err => toast(err.message || 'Export failed', 'error'));
  };

  /* ═══════════════════════════════════════════
     SEARCH CLEAR
     ═══════════════════════════════════════════ */
  window.clearSearch = function (id) {
    const el = $(id);
    if (!el) return;
    el.value = '';
    el.dispatchEvent(new Event('input'));
    el.focus();
  };

  /* ═══════════════════════════════════════════
     BOOT
     ═══════════════════════════════════════════ */
  function boot() {
    loadTheme();
    initNav();
    if (window.lucide) lucide.createIcons();

    if (window.currentUser) {
      state.user = window.currentUser;
      const av = $('avatarInitial');
      if (av) av.textContent = (state.user.name || 'A')[0].toUpperCase();
      loadDashboard();
      startRefreshPoll();
    } else {
      document.addEventListener('dashboard:ready', () => {
        state.user = window.currentUser;
        const av = $('avatarInitial');
        if (av) av.textContent = (state.user?.name || 'A')[0].toUpperCase();
        loadDashboard();
        startRefreshPoll();
      }, { once: true });
      setTimeout(() => {
        if (!state.booted && !window.currentUser) {
          state.booted = true;
          loadDashboard().catch(() => {});
        }
      }, 2500);
    }
  }

  function startRefreshPoll() {
    if (state.refreshTimer) clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(async () => {
      try {
        // silently refresh unread counts every 45s
        if (state.loaded.messages) {
          const msgs = await apiCall('/admin/messages').catch(() => ({ messages: [] }));
          const unread = {};
          (msgs.messages || []).forEach(m => {
            if (Number(m.sender_id) === Number(m.user_id)) unread[m.user_id] = (unread[m.user_id] || 0) + 1;
          });
          state.unreadByClient = unread;
          updateUnreadBadge();
          if (document.getElementById('messagesView')?.classList.contains('active-view')) {
            renderMessageThreads();
          }
        }
      } catch (_) {}
    }, 45_000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();