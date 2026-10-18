(function () {
  const page = location.pathname.split('/').pop();

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    const response = await fetch(`/api${path}`, {
      ...options,
      headers,
      credentials: 'same-origin',
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    if (response.status === 204) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      throw new Error('The API returned a web page instead of JSON. Configure your website host to route /api requests to the ComboMaster backend.');
    }
    let data;
    try {
      data = await response.json();
    } catch (_error) {
      throw new Error('The server returned an invalid response');
    }
    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

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

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function bindAuthForms() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const button = document.getElementById('loginButton');
        if (button) button.disabled = true;
        try {
          const { user, message } = await api('/auth/login', {
            method: 'POST',
            body: {
              email: document.getElementById('email').value,
              password: document.getElementById('password').value
            }
          });
          toast(message || 'Signed in successfully');
          location.replace(user.role === 'admin' ? 'admin-dashboard.html' : 'client-dashboard.html');
        } catch (error) {
          toast(error.message, 'error');
        } finally {
          if (button) button.disabled = false;
        }
      }, true);
    }

    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
      signupForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const password = document.getElementById('password').value;
        if (password !== document.getElementById('confirmPassword').value) {
          toast('Passwords do not match', 'error');
          return;
        }
        const button = document.getElementById('signupButton');
        if (button) button.disabled = true;
        try {
          await api('/auth/register', {
            method: 'POST',
            body: {
              name: document.getElementById('fullName').value,
              email: document.getElementById('email').value,
              password
            }
          });
          toast('Account created. You can now sign in.');
          location.replace('client-dashboard.html');
        } catch (error) {
          toast(error.message, 'error');
        } finally {
          if (button) button.disabled = false;
        }
      }, true);
    }
  }

  async function loadClientDashboard() {
    let user;
    try {
      ({ user } = await api('/auth/me'));
    } catch (error) {
      if (error.status === 401) {
        location.replace('login.html');
        return;
      }
      throw error;
    }
    if (user.role !== 'client') {
      location.replace('admin-dashboard.html');
      return;
    }

    const data = await api('/client/dashboard');
    const name = document.getElementById('clientNameSpan');
    if (name) name.textContent = user.name;
    const settingsName = document.getElementById('settingsName');
    const settingsEmail = document.getElementById('settingsEmail');
    const settingsHeight = document.getElementById('settingsHeight');
    if (settingsName) settingsName.value = user.name;
    if (settingsEmail) settingsEmail.value = user.email;
    if (settingsHeight) settingsHeight.value = data.profile.height_cm || '';
    updateClientStats(data);
    const settingsWeight = document.getElementById('settingsWeight');
    if (settingsWeight) settingsWeight.dataset.savedWeight = data.stats.latestWeightKg ?? '';
    renderClientLists(data);
    renderClientMessages(data.messages, user.id);
    renderClientBookings(data.bookings);
    updateProgressChart(data.progress);
    updateActivityChart(data.workouts);
    markUnavailableClientViews();
  }

  function updateClientStats(data) {
    const weight = document.getElementById('statWeight');
    if (weight) {
      weight.replaceChildren(document.createTextNode(`${data.stats.latestWeightKg ?? '—'} `));
      const unit = document.createElement('span');
      unit.className = 'text-base';
      unit.textContent = 'kg';
      weight.append(unit);
    }
    const bodyFat = document.getElementById('statBodyfat');
    if (bodyFat) bodyFat.textContent = data.stats.latestBodyFatPercent === null
      ? '—'
      : `${data.stats.latestBodyFatPercent}%`;
    for (const id of ['statStreak', 'statBadges']) {
      const stat = document.getElementById(id);
      if (stat) stat.textContent = '—';
    }
    const settingsWeight = document.getElementById('settingsWeight');
    if (settingsWeight) settingsWeight.value = data.stats.latestWeightKg ?? '';
  }

  function renderClientLists(data) {
    const meals = document.getElementById('mealLogList');
    if (meals) {
      meals.innerHTML = data.meals.length
        ? data.meals.slice(0, 5).map((meal) =>
          `<div class="flex justify-between items-center p-3 rounded-xl bg-[var(--bg-secondary)]"><span>${escapeHtml(meal.meal_name)}</span><span class="text-xs text-muted">${meal.calories === null ? '' : `${meal.calories} kcal`}</span></div>`
        ).join('')
        : '<p class="text-sm text-muted">No meals logged yet.</p>';
    }
    const workouts = document.getElementById('workoutHistoryList');
    if (workouts) {
      workouts.innerHTML = data.workouts.length
        ? data.workouts.slice(0, 8).map((workout) =>
          `<div class="flex justify-between items-center p-3 rounded-xl bg-[var(--bg-secondary)]"><span>${escapeHtml(workout.workout_name)}</span><span class="text-xs text-muted">${workout.duration_minutes} min</span></div>`
        ).join('')
        : '<p class="text-sm text-muted">No workouts logged yet.</p>';
    }
  }

  function renderClientMessages(messages, userId) {
    const container = document.getElementById('chatMessagesContainer');
    if (!container) return;
    container.innerHTML = messages.length
      ? [...messages].reverse().map((message) => {
        const own = Number(message.sender_id) === Number(userId);
        return `<div class="flex ${own ? 'justify-end' : 'justify-start'}"><div class="max-w-[80%] rounded-xl px-3 py-2 ${own ? 'bg-amber-500/20' : 'bg-[var(--bg-secondary)]'}">${escapeHtml(message.body)}<div class="text-[10px] text-muted mt-1">${new Date(message.created_at).toLocaleString()}</div></div></div>`;
      }).join('')
      : '<p class="text-sm text-muted">No messages yet. Send a message to your coach.</p>';
    container.scrollTop = container.scrollHeight;
  }

  function renderClientBookings(bookings) {
    const view = document.getElementById('bookingsView');
    if (!view) return;
    view.innerHTML = `<div class="flex justify-between items-center flex-wrap gap-3"><h1 class="font-display text-2xl font-semibold">Coach Sessions</h1><button class="btn-gold px-4 py-2 rounded-xl" onclick="openBookingRequestModal()">+ Request Booking</button></div><div data-api-bookings class="glass-card p-5 mt-4 space-y-3">${bookings.length
      ? bookings.map((booking) =>
      `<div class="flex justify-between items-center"><div><p class="font-semibold">${escapeHtml(booking.service)}</p><p class="text-xs text-muted">${new Date(booking.requested_at).toLocaleString()}</p></div><span class="badge-gold">${escapeHtml(booking.status)}</span></div>`
      ).join('')
      : '<p class="text-sm text-muted">No booking requests yet.</p>'}</div>`;
  }

  function updateProgressChart(progress) {
    const canvas = document.getElementById('weightProgressChart');
    const chart = canvas && window.Chart?.getChart(canvas);
    if (!chart) return;
    const ordered = [...progress].reverse();
    chart.data.labels = ordered.map((entry) => new Date(entry.recorded_at).toLocaleDateString());
    chart.data.datasets[0].data = ordered.map((entry) => Number(entry.weight_kg));
    chart.update();
  }

  function updateActivityChart(workouts) {
    const canvas = document.getElementById('activityChart');
    const chart = canvas && window.Chart?.getChart(canvas);
    if (!chart) return;
    const counts = Array(7).fill(0);
    const labels = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - offset);
      labels.push(date.toLocaleDateString(undefined, { weekday: 'short' }));
    }
    workouts.forEach((workout) => {
      const date = new Date(workout.completed_at);
      date.setHours(0, 0, 0, 0);
      const offset = Math.round((today - date) / 86400000);
      if (offset >= 0 && offset < counts.length) counts[counts.length - offset - 1] += 1;
    });
    chart.data.labels = labels;
    chart.data.datasets[0].data = counts;
    chart.update();
  }

  function markUnavailableClientViews() {
    const unavailable = {
      paymentsView: ['Payments', 'Payment history will appear here after a payment provider is configured.'],
      achievementsView: ['Achievements', 'Achievements are not connected to a tracking service yet.']
    };
    Object.entries(unavailable).forEach(([id, [title, message]]) => {
      const view = document.getElementById(id);
      if (view) {
        view.querySelectorAll('canvas').forEach((canvas) => window.Chart?.getChart(canvas)?.destroy());
        view.innerHTML = `<h1 class="font-display text-2xl font-semibold">${title}</h1><div class="glass-card p-5 mt-4 text-sm text-muted">${message}</div>`;
      }
    });
  }

  function bindClientActions() {
    window.logQuickMeal = () => window.openLogMealModal?.();
    window.customLogMeal = async () => {
      try {
        const meal = await api('/client/meals', {
          method: 'POST',
          body: {
            meal_name: document.getElementById('customMealName').value,
            calories: document.getElementById('customMealCal').value
          }
        });
        toast(`${meal.meal_name} logged`);
        window.closeModal?.();
        await loadClientDashboard();
      } catch (error) {
        toast(error.message, 'error');
      }
    };
    window.customLogWorkout = async () => {
      try {
        const workout = await api('/client/workouts', {
          method: 'POST',
          body: {
            workout_name: document.getElementById('customWorkoutName').value,
            duration_minutes: document.getElementById('customWorkoutDur').value
          }
        });
        toast(`${workout.workout_name} logged`);
        window.closeModal?.();
        await loadClientDashboard();
      } catch (error) {
        toast(error.message, 'error');
      }
    };
    window.addWeightEntry = async () => {
      try {
        await api('/client/progress', {
          method: 'POST',
          body: { weight_kg: document.getElementById('newWeightValue').value }
        });
        toast('Progress saved');
        window.closeModal?.();
        await loadClientDashboard();
      } catch (error) {
        toast(error.message, 'error');
      }
    };
    window.saveClientProfile = async () => {
      try {
        const profile = await api('/client/profile', {
          method: 'PATCH',
          body: {
            name: document.getElementById('settingsName').value,
            height_cm: document.getElementById('settingsHeight').value || null
          }
        });
        toast('Profile updated');
        const label = document.getElementById('clientNameSpan');
        if (label) label.textContent = profile.profile.name;
        const settingsWeight = document.getElementById('settingsWeight');
        const weight = settingsWeight.value;
        if (weight && weight !== settingsWeight.dataset.savedWeight) {
          await api('/client/progress', { method: 'POST', body: { weight_kg: weight } });
        }
        await loadClientDashboard();
      } catch (error) {
        toast(error.message, 'error');
      }
    };
    window.sendClientMessage = async () => {
      const input = document.getElementById('messageInput');
      const body = input?.value.trim();
      if (!body) return;
      try {
        await api('/client/messages', { method: 'POST', body: { body } });
        input.value = '';
        await loadClientDashboard();
      } catch (error) {
        toast(error.message, 'error');
      }
    };
    window.openBookingRequestModal = () => {
      window.openModal?.('Request Booking', `<form id="apiBookingForm"><label class="block text-sm mb-2">Service</label><input id="apiBookingService" class="form-input mb-3" required maxlength="120" placeholder="Personal training"><label class="block text-sm mb-2">Date and time</label><input id="apiBookingDate" type="datetime-local" class="form-input mb-4" required><button class="btn-gold w-full py-2 rounded-xl">Send Request</button></form>`);
      document.getElementById('apiBookingForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          await api('/client/bookings', {
            method: 'POST',
            body: {
              service: document.getElementById('apiBookingService').value,
              requested_at: document.getElementById('apiBookingDate').value
            }
          });
          toast('Booking request sent');
          window.closeModal?.();
          await loadClientDashboard();
        } catch (error) {
          toast(error.message, 'error');
        }
      });
    };
    window.logoutClient = async () => {
      try {
        await api('/auth/logout', { method: 'POST' });
        location.replace('login.html');
      } catch (error) {
        toast(error.message, 'error');
      }
    };
  }

  async function loadAdminDashboard() {
    let user;
    try {
      ({ user } = await api('/auth/me'));
    } catch (error) {
      if (error.status === 401) {
        location.replace('login.html');
        return;
      }
      throw error;
    }
    if (user.role !== 'admin') {
      location.replace('client-dashboard.html');
      return;
    }
    const [dashboard, clients, bookings, messages, orders, sales, programs, settings] = await Promise.all([
      api('/admin/dashboard'),
      api('/admin/clients'),
      api('/admin/bookings'),
      api('/admin/messages'),
      api('/admin/orders'),
      api('/admin/sales'),
      api('/admin/programs'),
      api('/admin/settings')
    ]);
    renderAdminStats(dashboard.stats);
    renderAdminClients(clients.clients);
    renderAdminRecentBookings(bookings.bookings);
    renderAdminBookings(bookings.bookings);
    renderAdminMessages(messages.messages);
    renderAdminOrders(orders.orders);
    renderAdminSales(sales, dashboard.stats);
    renderAdminPrograms(programs.programs);
    renderAdminSettings(settings.settings);
  }

  function renderAdminStats(stats) {
    const cards = [...document.querySelectorAll('#dashboardView .stat-card')];
    const values = [
      ['Registered clients', stats.clients],
      ['New clients today', stats.joinedToday],
      ['Booking requests', stats.bookings],
      ['Pending bookings', stats.pendingBookings]
    ];
    cards.forEach((card, index) => {
      const heading = card.querySelector('p');
      const value = card.querySelector('.font-display');
      const caption = card.querySelectorAll('p')[1];
      if (heading && value) {
        heading.textContent = values[index][0];
        value.textContent = values[index][1];
      }
      if (caption) caption.textContent = 'Live data from ComboMaster';
    });
  }

  function renderAdminClients(clients) {
    const body = document.getElementById('clientListTbody');
    if (!body) return;
    body.innerHTML = clients.length
      ? clients.map((client) =>
        `<tr><td>${escapeHtml(client.name)}</td><td>${escapeHtml(client.email)}</td><td>${escapeHtml(client.goal || '—')}</td><td><span class="badge">Client</span></td><td>${client.last_progress_at ? new Date(client.last_progress_at).toLocaleDateString() : 'No progress yet'}</td><td>${Number(client.pending_bookings) ? `${client.pending_bookings} pending` : ''}</td></tr>`
      ).join('')
      : '<tr><td colspan="6">No clients have registered yet.</td></tr>';
  }

  function renderAdminRecentBookings(bookings) {
    const body = document.querySelector('#dashboardView table tbody');
    if (!body) return;
    body.innerHTML = bookings.length
      ? bookings.slice(0, 5).map((booking) =>
        `<tr><td class="py-2">${escapeHtml(booking.client_name)}</td><td>${escapeHtml(booking.service)}</td><td>${new Date(booking.requested_at).toLocaleString()}</td><td><span class="badge">${escapeHtml(booking.status)}</span></td></tr>`
      ).join('')
      : '<tr><td colspan="4" class="py-2">No booking requests yet.</td></tr>';
  }

  function formatMoney(amount, currency = 'ZMW') {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount) || 0);
  }

  function renderAdminOrders(orders) {
    const renderTable = (compact = false) => orders.length
      ? `<table class="w-full dash-table"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th>${compact ? '' : '<th>Date</th>'}</tr></thead><tbody>${orders.map((order) => {
        const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]');
        const itemSummary = items.map((item) => `${escapeHtml(item.title)} × ${Number(item.quantity) || 0}`).join(', ');
        return `<tr><td>${escapeHtml(order.tx_ref.slice(0, 8))}</td><td>${escapeHtml(order.customer_name)}<span class="block text-xs text-muted">${escapeHtml(order.customer_email)}</span></td><td>${itemSummary}</td><td>${formatMoney(order.amount, order.currency)}</td><td><span class="badge">${escapeHtml(order.status)}</span></td>${compact ? '' : `<td>${new Date(order.created_at).toLocaleString()}</td>`}</tr>`;
      }).join('')}</tbody></table>`
      : '<p class="p-4 text-sm text-muted">No shop orders yet.</p>';
    const ordersView = document.getElementById('ordersView');
    if (ordersView) ordersView.innerHTML = `<h1 class="font-display text-2xl font-semibold mb-4">Recent Orders</h1><div class="glass-card p-5 overflow-x-auto">${renderTable()}</div>`;
    const paymentsView = document.getElementById('paymentsView');
    if (paymentsView) paymentsView.innerHTML = `<h1 class="font-display text-2xl font-semibold mb-4">Payment Transactions</h1><div class="glass-card p-5 overflow-x-auto">${renderTable(true)}<p class="text-xs text-muted mt-3">Statuses update only after payment-provider verification.</p></div>`;
  }

  function renderAdminSales(sales, stats) {
    const salesView = document.getElementById('salesView');
    if (salesView) {
      const metrics = salesView.querySelectorAll('.grid > div');
      if (metrics[0]) metrics[0].innerHTML = `<p class="text-sm text-muted">Verified shop revenue</p><p class="font-display text-3xl font-bold text-gold">${formatMoney(sales.revenue, sales.currency)}</p>`;
      if (metrics[1]) metrics[1].innerHTML = `<p class="text-sm text-muted">Completed shop orders</p><p class="font-display text-3xl font-bold text-gold">${sales.completedOrders}</p>`;
    }
    const salesCanvas = document.getElementById('salesChartCanvas');
    const chart = salesCanvas && window.Chart?.getChart(salesCanvas);
    if (chart) {
      chart.data.labels = sales.monthly.map((row) => row.month);
      chart.data.datasets = [{
        label: `Verified shop revenue (${sales.currency})`,
        data: sales.monthly.map((row) => row.revenue),
        backgroundColor: '#f59e0b'
      }];
      chart.update();
    }
    const dashboardCanvas = document.getElementById('revenueChart');
    const dashboardChart = dashboardCanvas && window.Chart?.getChart(dashboardCanvas);
    if (dashboardChart) {
      dashboardChart.data.labels = sales.monthly.map((row) => row.month);
      dashboardChart.data.datasets = [{
        label: `Verified shop revenue (${sales.currency})`,
        data: sales.monthly.map((row) => row.revenue),
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245,158,11,0.08)',
        fill: true,
        tension: 0.3
      }];
      dashboardChart.update();
    }
    const reports = document.getElementById('reportsView');
    if (reports) {
      reports.innerHTML = `<h1 class="font-display text-2xl font-semibold">Business Reports</h1><div class="grid md:grid-cols-2 gap-5 mt-5"><div class="glass-card p-5"><h2 class="font-semibold">Verified Shop Sales</h2><p class="font-display text-3xl text-gold mt-2">${formatMoney(sales.revenue, sales.currency)}</p><p class="text-sm text-muted mt-2">${sales.completedOrders} completed orders</p></div><div class="glass-card p-5"><h2 class="font-semibold">Client Activity</h2><p class="text-sm mt-3">${stats.clients} registered clients</p><p class="text-sm text-muted mt-2">${stats.joinedToday} joined today · ${stats.pendingBookings} pending bookings</p></div></div><div class="glass-card p-5 mt-5"><h2 class="font-semibold mb-3">Monthly verified shop revenue</h2><div class="overflow-x-auto"><table class="w-full dash-table"><thead><tr><th>Month</th><th>Orders</th><th>Revenue</th></tr></thead><tbody>${sales.monthly.length ? sales.monthly.map((row) => `<tr><td>${escapeHtml(row.month)}</td><td>${row.orders}</td><td>${formatMoney(row.revenue, sales.currency)}</td></tr>`).join('') : '<tr><td colspan="3">No verified sales yet.</td></tr>'}</tbody></table></div></div>`;
    }
  }

  function renderAdminPrograms(programs) {
    const view = document.getElementById('coachingProgramsView');
    if (!view) return;
    view.innerHTML = `<div class="flex justify-between items-center flex-wrap gap-3 mb-5"><h1 class="font-display text-2xl font-semibold">Coaching Programs</h1><button class="btn-gold px-4 py-2 rounded-lg text-sm" id="addProgramButton">Add Program</button></div><div class="grid sm:grid-cols-2 gap-5">${programs.length ? programs.map((program) => `<article class="glass-card p-5"><div class="flex justify-between gap-3"><h2 class="font-semibold">${escapeHtml(program.name)}</h2><span class="badge">${program.is_active ? 'Active' : 'Inactive'}</span></div><p class="text-xs text-muted mt-1">${Number(program.duration_weeks)} weeks</p><p class="text-sm mt-3">${escapeHtml(program.description || 'No description')}</p><button class="btn-outline text-xs px-3 py-1 rounded-lg mt-4" data-edit-program="${program.id}">Edit</button></article>`).join('') : '<p class="text-sm text-muted">No programs have been added yet.</p>'}</div>`;
    view.querySelector('#addProgramButton')?.addEventListener('click', () => openAdminProgramModal());
    view.querySelectorAll('[data-edit-program]').forEach((button) => {
      button.addEventListener('click', () => openAdminProgramModal(programs.find((program) => Number(program.id) === Number(button.dataset.editProgram))));
    });
    const dashboardHeading = [...document.querySelectorAll('#dashboardView h3')]
      .find((heading) => heading.textContent.includes('Top Coaching Programs'));
    const dashboardCard = dashboardHeading?.closest('.glass-card');
    if (dashboardCard) {
      dashboardCard.innerHTML = `<h3 class="font-display text-lg font-semibold">Coaching Programs</h3><div class="mt-4 flex flex-wrap gap-5">${programs.length ? programs.filter((program) => program.is_active).map((program) => `<div><span class="text-gold font-bold">${escapeHtml(program.name)}</span><p class="text-xs text-muted">${Number(program.duration_weeks)} weeks</p></div>`).join('') : '<p class="text-sm text-muted">No active programs.</p>'}</div>`;
    }
  }

  function openAdminProgramModal(program) {
    const editing = Boolean(program);
    window.openModal?.(editing ? 'Edit Program' : 'Add Program', `<form id="adminProgramForm" class="space-y-4"><div><label class="text-sm block mb-1" for="adminProgramName">Program name</label><input id="adminProgramName" class="form-input" maxlength="160" required value="${escapeHtml(program?.name || '')}"></div><div><label class="text-sm block mb-1" for="adminProgramDuration">Duration (weeks)</label><input id="adminProgramDuration" type="number" min="1" max="104" class="form-input" required value="${Number(program?.duration_weeks) || 12}"></div><div><label class="text-sm block mb-1" for="adminProgramDescription">Description</label><textarea id="adminProgramDescription" class="form-input" maxlength="5000" rows="3">${escapeHtml(program?.description || '')}</textarea></div>${editing ? `<label class="flex items-center gap-2 text-sm"><input id="adminProgramActive" type="checkbox" ${program.is_active ? 'checked' : ''}> Active</label>` : ''}<button class="btn-gold w-full py-2 rounded-lg">${editing ? 'Save Program' : 'Create Program'}</button></form>`);
    document.getElementById('adminProgramForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const body = {
        name: document.getElementById('adminProgramName').value,
        duration_weeks: Number(document.getElementById('adminProgramDuration').value),
        description: document.getElementById('adminProgramDescription').value,
        ...(editing ? { is_active: document.getElementById('adminProgramActive').checked } : {})
      };
      try {
        await api(editing ? `/admin/programs/${program.id}` : '/admin/programs', {
          method: editing ? 'PUT' : 'POST', body
        });
        window.closeModal?.();
        await loadAdminDashboard();
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  }

  function renderAdminSettings(settings) {
    const name = document.getElementById('businessName');
    const email = document.getElementById('contactEmail');
    if (name) name.value = settings.business_name;
    if (email) email.value = settings.contact_email;
  }

  async function saveBusinessSettings() {
    try {
      await api('/admin/settings', {
        method: 'PUT',
        body: {
          business_name: document.getElementById('businessName').value,
          contact_email: document.getElementById('contactEmail').value
        }
      });
      toast('Settings saved', 'success');
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function renderAdminBookings(bookings) {
    const view = document.getElementById('bookingsView');
    if (!view) return;
    const rows = bookings.length
      ? `<table class="w-full dash-table"><thead><tr><th>Client</th><th>Service</th><th>Date</th><th>Status</th><th>Action</th></tr></thead><tbody>${bookings.map((booking) => `<tr><td>${escapeHtml(booking.client_name)}</td><td>${escapeHtml(booking.service)}</td><td>${new Date(booking.requested_at).toLocaleString()}</td><td>${escapeHtml(booking.status)}</td><td>${booking.status === 'pending' ? `<button class="text-gold mr-2" data-booking-id="${booking.id}" data-booking-status="approved">Approve</button><button class="text-red-400" data-booking-id="${booking.id}" data-booking-status="declined">Decline</button>` : ''}</td></tr>`).join('')}</tbody></table>`
      : '<p class="text-sm text-muted">No booking requests.</p>';
    view.innerHTML = `<h1 class="font-display text-2xl font-semibold mb-4">Sessions & Bookings</h1><div data-api-bookings class="glass-card p-5 mt-5 overflow-x-auto"><h2 class="font-semibold mb-3">Live booking requests</h2>${rows}</div>`;
    const section = view.querySelector('[data-api-bookings]');
    section.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-booking-id]');
      if (!button) return;
      try {
        await api(`/admin/bookings/${button.dataset.bookingId}`, {
          method: 'PATCH',
          body: { status: button.dataset.bookingStatus }
        });
        await loadAdminDashboard();
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  }

  function renderAdminMessages(messages) {
    const list = document.getElementById('msgThreadList');
    if (!list) return;
    const threads = new Map();
    messages.forEach((message) => {
      if (!threads.has(String(message.user_id))) threads.set(String(message.user_id), {
        userId: message.user_id,
        name: message.client_name,
        messages: []
      });
      threads.get(String(message.user_id)).messages.push(message);
    });
    list.innerHTML = threads.size
      ? [...threads.values()].map((thread) =>
        `<button class="w-full text-left p-3 border-b border-[var(--border-color)] hover:bg-white/5" data-thread-user="${thread.userId}"><span class="font-semibold">${escapeHtml(thread.name)}</span><span class="block text-xs text-muted truncate">${escapeHtml(thread.messages.at(-1).body)}</span></button>`
      ).join('')
      : '<p class="p-4 text-sm text-muted">No client messages yet.</p>';
    list.onclick = (event) => {
      const button = event.target.closest('[data-thread-user]');
      if (!button) return;
      const thread = threads.get(button.dataset.threadUser);
      window.activeMessageUserId = thread.userId;
      const title = document.getElementById('chatClientName');
      const panel = document.getElementById('chatDetailPanel');
      const body = document.getElementById('chatMessages');
      if (title) title.textContent = thread.name;
      if (panel) panel.classList.remove('hidden');
      if (body) body.innerHTML = thread.messages.map((message) =>
        `<div class="p-2 rounded-lg bg-[var(--bg-secondary)]">${escapeHtml(message.body)}<div class="text-[10px] text-muted">${Number(message.sender_id) === Number(thread.userId) ? 'Client' : 'Coach'} · ${new Date(message.created_at).toLocaleString()}</div></div>`
      ).join('');
    };
  }

  function bindAdminActions() {
    const addClientButton = document.querySelector('#clientsView button[onclick*="openAddClientModal"]');
    if (addClientButton) {
      addClientButton.textContent = 'Clients register online';
      addClientButton.disabled = true;
      addClientButton.removeAttribute('onclick');
    }
    window.sendAdminReply = async () => {
      const input = document.getElementById('chatReplyInput');
      const body = input?.value.trim();
      if (!body || !window.activeMessageUserId) {
        toast('Select a client conversation first', 'error');
        return;
      }
      try {
        await api(`/admin/messages/${window.activeMessageUserId}`, { method: 'POST', body: { body } });
        input.value = '';
        await loadAdminDashboard();
      } catch (error) {
        toast(error.message, 'error');
      }
    };
    window.logoutAdmin = async () => {
      try {
        await api('/auth/logout', { method: 'POST' });
        location.replace('login.html');
      } catch (error) {
        toast(error.message, 'error');
      }
    };
    window.saveBusinessSettings = saveBusinessSettings;
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindAuthForms();
    if (page === 'client-dashboard.html') {
      bindClientActions();
      updateClientStats({
        stats: { latestWeightKg: null, latestBodyFatPercent: null },
        profile: {}
      });
      updateProgressChart([]);
      updateActivityChart([]);
      renderClientLists({ meals: [], workouts: [] });
      renderClientMessages([], 0);
      renderClientBookings([]);
      markUnavailableClientViews();
      loadClientDashboard().catch((error) => toast(error.message, 'error'));
    } else if (page === 'admin-dashboard.html') {
      bindAdminActions();
      renderAdminStats({ clients: '—', joinedToday: '—', bookings: '—', pendingBookings: '—' });
      renderAdminClients([]);
      renderAdminRecentBookings([]);
      renderAdminBookings([]);
      renderAdminMessages([]);
      markUnavailableAdminViews();
      loadAdminDashboard().catch((error) => toast(error.message, 'error'));
    }
  });
})();
