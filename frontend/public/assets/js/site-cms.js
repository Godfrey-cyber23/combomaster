(function () {
  const pages = [
    ['index', 'Home'], ['about', 'About'], ['services', 'Services'],
    ['membership', 'Membership'], ['mealplans', 'Meal Plans'], ['shop', 'Shop'],
    ['transformations', 'Transformations'], ['contact', 'Contact']
  ];
  const page = location.pathname.split('/').pop().replace(/\.html$/, '') || 'index';
  const currentPage = page === 'index' ? 'index' : page;
  let staff = false;
  let items = [];
  let editingId = null;

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body !== undefined && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(`/api${path}`, {
      ...options,
      headers,
      credentials: 'same-origin',
      body: options.body === undefined || options.body instanceof FormData
        ? options.body
        : JSON.stringify(options.body)
    });
    if (response.status === 204) return null;
    let data;
    try {
      data = await response.json();
    } catch (_error) {
      throw new Error('The server returned an invalid response');
    }
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function isPublished(item) {
    return item.is_published === true || Number(item.is_published) === 1;
  }

  function showNotice(message, isError = false) {
    let notice = document.getElementById('cms-notice');
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'cms-notice';
      notice.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:10002;padding:12px 18px;border-radius:10px;background:#111827;color:#f8fafc;box-shadow:0 8px 30px #0008';
      document.body.append(notice);
    }
    notice.textContent = message;
    notice.style.border = `1px solid ${isError ? '#ef4444' : '#d4a853'}`;
    notice.hidden = false;
    clearTimeout(notice._timer);
    notice._timer = setTimeout(() => { notice.hidden = true; }, 3500);
  }

  function targets() {
    return [...document.querySelectorAll('h1,h2,h3,p,img')]
      .filter((element) => !element.closest('nav,footer,#site-navbar,#site-footer,#cms-manager,.shop-content,#plans .grid,#cms-content-blocks'))
      .map((element, index) => {
        const key = `${element.tagName === 'IMG' ? 'image' : 'text'}-${element.tagName.toLowerCase()}-${index}`;
        element.dataset.cmsRef = key;
        const label = element.tagName === 'IMG'
          ? `Image: ${element.alt || element.getAttribute('src') || 'Untitled'}`
          : `${element.tagName.toLowerCase()}: ${(element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80)}`;
        return { key, label, element };
      });
  }

  function applyOverrides(list) {
    const byKey = new Map(targets().map((target) => [target.key, target.element]));
    list.filter((item) => item.kind === 'override').forEach((item) => {
      const target = byKey.get(item.target_key);
      if (!target) return;
      target.style.display = item.details?.hidden === true ? 'none' : '';
      if (item.details?.hidden === true) return;
      if (item.target_key.startsWith('image-') && item.image_url) {
        target.src = item.image_url;
        if (item.title) target.alt = item.title;
      } else if (item.target_key.startsWith('text-')) {
        target.textContent = item.description;
      }
    });
  }

  function renderBlocks(list) {
    let zone = document.getElementById('cms-content-blocks');
    if (!zone) {
      zone = document.createElement('section');
      zone.id = 'cms-content-blocks';
      zone.className = 'section-padding';
      const footer = document.getElementById('site-footer');
      if (footer) footer.before(zone);
      else (document.querySelector('main') || document.body).append(zone);
    }
    const blocks = list.filter((item) => item.kind === 'block');
    zone.innerHTML = blocks.length
      ? `<div class="max-w-7xl mx-auto px-4 sm:px-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">${blocks.map((item) =>
        `<article class="glass-card rounded-2xl overflow-hidden">${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" loading="lazy" class="w-full h-56 object-cover">` : ''}<div class="p-5"><h2 class="font-display text-xl font-semibold">${escapeHtml(item.title)}</h2><p class="mt-2 text-sm text-muted-custom">${escapeHtml(item.description)}</p></div></article>`
      ).join('')}</div>`
      : '';
    zone.hidden = blocks.length === 0;
  }

  function renderShopCatalog(list, managed) {
    if (!managed || !window.PRODUCTS || typeof window.renderProducts !== 'function') return;
    const catalog = { supplements: [], attire: [], equipment: [] };
    list.filter((item) => item.kind === 'product' && catalog[item.category]).forEach((item) => {
      catalog[item.category].push({
        name: item.title,
        unit: item.unit,
        price: item.price,
        img: item.image_url || '',
        shape: item.details?.shape
      });
    });
    window.PRODUCTS = catalog;
    window.renderProducts();
    document.querySelectorAll('.shop-content .reveal-on-scroll').forEach((card) => {
      card.classList.remove('reveal-on-scroll');
    });
  }

  function renderMealCatalog(list, managed) {
    if (!managed) return;
    const grid = document.querySelector('#plans .grid');
    if (!grid) return;
    const plans = list.filter((item) => item.kind === 'meal_plan');
    grid.innerHTML = plans.map((item) => {
      const image = item.image_url
        ? `<div class="w-24 h-24 sm:w-full sm:h-52 flex-shrink-0 overflow-hidden"><img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" loading="lazy" class="meal-card-img w-full h-full object-cover"></div>`
        : '';
      return `<article class="glass-card card-hover rounded-xl sm:rounded-2xl overflow-hidden meal-card"><div class="flex sm:block">${image}<div class="p-3 sm:p-5 md:p-6 flex flex-col flex-1 min-w-0"><h3 class="font-display text-sm sm:text-lg md:text-xl font-semibold mb-2">${escapeHtml(item.title)}</h3><p class="text-xs sm:text-sm text-muted-custom mb-4 flex-grow">${escapeHtml(item.description)}</p><div class="flex items-center justify-between gap-2">${item.price ? `<span class="font-display text-lg font-semibold text-gold">${escapeHtml(item.price)}</span>` : ''}<a href="contact.html" class="btn-gold text-center text-xs sm:text-sm font-semibold py-2.5 px-4 rounded-xl">${item.title === 'Free Nutrition E-Book' ? 'Get the free guide' : 'Ask about this plan'}</a></div></div></div></article>`;
    }).join('');
    if (window.lucide) window.lucide.createIcons();
  }

  async function loadPageContent() {
    const { items: published, managed } = await request(`/content/${encodeURIComponent(currentPage)}`);
    items = published;
    applyOverrides(items);
    renderBlocks(items);
    renderShopCatalog(items, managed);
    renderMealCatalog(items, managed);
  }

  function editorMarkup() {
    const pageOptions = pages.map(([value, label]) =>
      `<option value="${value}" ${value === currentPage ? 'selected' : ''}>${label}</option>`
    ).join('');
    return `<div id="cms-manager" style="position:fixed;inset:0;z-index:10000;background:#0009;display:none;align-items:center;justify-content:center;padding:16px;font:14px Inter,Arial,sans-serif;color:#f8fafc"><section style="width:min(1050px,100%);max-height:92vh;overflow:auto;background:#111827;border:1px solid #475569;border-radius:18px;padding:20px;box-shadow:0 20px 80px #000b"><header style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px"><div><h2 style="font-size:22px;margin:0">Site content manager</h2><p style="color:#cbd5e1;margin:6px 0 0">Edit page copy, images, meal plans, products, and reusable content blocks.</p></div><button type="button" data-cms-close style="background:#334155;color:white;border:0;border-radius:8px;padding:9px 13px">Close</button></header><div style="display:grid;grid-template-columns:minmax(220px,1fr) minmax(320px,1.4fr);gap:20px"><section><label for="cms-page">Page</label><select id="cms-page" style="width:100%;padding:10px;margin:6px 0 14px">${pageOptions}</select><div id="cms-item-list" style="display:grid;gap:8px"></div></section><form id="cms-form" style="display:grid;gap:9px;align-content:start"><input id="cms-id" type="hidden"><label>Content type<select id="cms-kind" style="width:100%;padding:9px;margin-top:4px"><option value="block">New content block</option><option value="override">Edit existing page text/image</option><option value="product">Shop product</option><option value="meal_plan">Meal plan</option></select></label><label id="cms-target-wrap">Existing page element<select id="cms-target" style="width:100%;padding:9px;margin-top:4px"></select></label><label>Title / image alt<input id="cms-title" maxlength="160" style="width:100%;padding:9px;margin-top:4px"></label><label id="cms-description-wrap">Text / description<textarea id="cms-description" rows="4" maxlength="5000" style="width:100%;padding:9px;margin-top:4px"></textarea></label><label id="cms-image-wrap">Image URL<input id="cms-image" maxlength="2048" placeholder="Paste an HTTPS image URL or upload below" style="width:100%;padding:9px;margin-top:4px"></label><label>Upload image<input id="cms-upload" type="file" accept="image/jpeg,image/png,image/webp,image/gif" style="display:block;width:100%;padding:8px;margin-top:4px"></label><div id="cms-catalog-fields" style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label>Category<select id="cms-category" style="width:100%;padding:9px;margin-top:4px"><option value="">Choose</option><option value="supplements">Supplements</option><option value="attire">Gym attire</option><option value="equipment">Equipment</option></select></label><label>Unit / size<input id="cms-unit" maxlength="120" style="width:100%;padding:9px;margin-top:4px"></label><label>Price<input id="cms-price" maxlength="40" style="width:100%;padding:9px;margin-top:4px"></label><label>Sort order<input id="cms-sort" type="number" value="0" style="width:100%;padding:9px;margin-top:4px"></label></div><label id="cms-published-wrap"><input id="cms-published" type="checkbox" checked> Published on the website</label><div style="display:flex;gap:8px"><button id="cms-save" type="submit" style="background:#d4a853;color:#111827;border:0;border-radius:8px;padding:10px 16px;font-weight:700">Save content</button><button id="cms-new" type="button" style="background:#334155;color:white;border:0;border-radius:8px;padding:10px 16px">New item</button></div><p id="cms-error" role="status" style="color:#fca5a5;margin:0"></p></form></div></section></div>`;
  }

  function eligibleTargets(pageKey) {
    const select = document.getElementById('cms-target');
    select.replaceChildren();
    if (pageKey !== currentPage) {
      select.add(new Option('Open this page to edit its existing elements', ''));
      return;
    }
    targets().forEach(({ key, label }) => select.add(new Option(label, key)));
  }

  function updateFieldVisibility() {
    const kind = document.getElementById('cms-kind').value;
    document.getElementById('cms-target-wrap').hidden = kind !== 'override';
    document.getElementById('cms-catalog-fields').hidden = kind !== 'product' && kind !== 'meal_plan';
    document.getElementById('cms-catalog-fields').querySelector('label').hidden = kind !== 'product';
    document.getElementById('cms-catalog-fields').querySelectorAll('label')[1].hidden = kind !== 'product';
    document.getElementById('cms-published-wrap').hidden = false;
    document.getElementById('cms-published-wrap').lastChild.textContent =
      kind === 'override' ? ' Visible on the page' : ' Published on the website';
    document.getElementById('cms-description-wrap').hidden = kind === 'override' &&
      document.getElementById('cms-target').value.startsWith('image-');
    document.getElementById('cms-image-wrap').hidden = kind === 'override' &&
      document.getElementById('cms-target').value.startsWith('text-');
  }

  function resetForm() {
    const form = document.getElementById('cms-form');
    form.reset();
    document.getElementById('cms-id').value = '';
    document.getElementById('cms-published').checked = true;
    document.getElementById('cms-sort').value = '0';
    document.getElementById('cms-error').textContent = '';
    editingId = null;
    updateFieldVisibility();
  }

  function renderItemList() {
    const list = document.getElementById('cms-item-list');
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No content has been added for this page.';
      empty.style.color = '#cbd5e1';
      list.append(empty);
      return;
    }
    items.forEach((item) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;background:#1e293b;padding:8px;border-radius:9px';
      const label = document.createElement('span');
      label.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis';
      label.textContent = `${item.kind} · ${item.title || item.target_key || `#${item.id}`}${isPublished(item) ? '' : ' · draft'}`;
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.dataset.editId = item.id;
      edit.textContent = 'Edit';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.dataset.deleteId = item.id;
      remove.textContent = 'Delete';
      [edit, remove].forEach((button) => {
        button.style.cssText = 'border:0;border-radius:6px;padding:7px;background:#334155;color:white;cursor:pointer';
      });
      row.append(label, edit, remove);
      list.append(row);
    });
  }

  async function refreshEditor() {
    const selectedPage = document.getElementById('cms-page').value;
    const response = await request(`/admin/content?page=${encodeURIComponent(selectedPage)}`);
    items = response.items;
    renderItemList();
    eligibleTargets(selectedPage);
    if (selectedPage === 'shop') document.getElementById('cms-kind').querySelector('[value="product"]').disabled = false;
    if (selectedPage !== 'shop') document.getElementById('cms-kind').querySelector('[value="product"]').disabled = true;
    if (selectedPage !== 'mealplans') document.getElementById('cms-kind').querySelector('[value="meal_plan"]').disabled = true;
    else document.getElementById('cms-kind').querySelector('[value="meal_plan"]').disabled = false;
    document.getElementById('cms-kind').querySelector('[value="override"]').disabled = selectedPage !== currentPage;
  }

  async function uploadSelectedImage() {
    const file = document.getElementById('cms-upload').files[0];
    if (!file) return document.getElementById('cms-image').value.trim();
    const formData = new FormData();
    formData.set('image', file);
    const { image_url: imageUrl } = await request('/admin/uploads', { method: 'POST', body: formData });
    return imageUrl;
  }

  async function saveContent(event) {
    event.preventDefault();
    const error = document.getElementById('cms-error');
    error.textContent = '';
    try {
      const kind = document.getElementById('cms-kind').value;
      const selectedPage = document.getElementById('cms-page').value;
      const target = document.getElementById('cms-target').value;
      const imageUrl = await uploadSelectedImage();
      const payload = {
        page: selectedPage,
        kind,
        target_key: kind === 'override' ? target : null,
        title: document.getElementById('cms-title').value,
        description: document.getElementById('cms-description').value,
        image_url: imageUrl || null,
        category: kind === 'product' ? document.getElementById('cms-category').value : null,
        unit: kind === 'product' ? document.getElementById('cms-unit').value : null,
        price: kind === 'product' || kind === 'meal_plan' ? document.getElementById('cms-price').value : null,
        sort_order: Number(document.getElementById('cms-sort').value) || 0,
        is_published: kind === 'override' || document.getElementById('cms-published').checked,
        details: kind === 'override'
          ? { hidden: !document.getElementById('cms-published').checked }
          : kind === 'product'
            ? (items.find((item) => String(item.id) === document.getElementById('cms-id').value)?.details || { shape: 'square' })
            : {}
      };
      if (kind === 'product' && selectedPage !== 'shop') throw new Error('Products can only be managed on the shop page');
      if (kind === 'meal_plan' && selectedPage !== 'mealplans') throw new Error('Meal plans can only be managed on the meal plans page');
      if (kind === 'override' && !target) throw new Error('Choose an existing page element to edit');
      if (kind === 'override' && target.startsWith('image-')) payload.description = '';
      if (kind === 'override' && target.startsWith('text-')) payload.image_url = null;
      const id = document.getElementById('cms-id').value;
      await request(id ? `/admin/content/${id}` : '/admin/content', {
        method: id ? 'PUT' : 'POST',
        body: payload
      });
      await loadPageContent();
      await refreshEditor();
      resetForm();
      showNotice('Page content saved');
    } catch (saveError) {
      error.textContent = saveError.message;
    }
  }

  function bindEditor() {
    const manager = document.getElementById('cms-manager');
    document.getElementById('cms-page').addEventListener('change', async () => {
      resetForm();
      await refreshEditor();
    });
    document.getElementById('cms-kind').addEventListener('change', updateFieldVisibility);
    document.getElementById('cms-target').addEventListener('change', updateFieldVisibility);
    document.getElementById('cms-form').addEventListener('submit', saveContent);
    document.getElementById('cms-new').addEventListener('click', resetForm);
    manager.addEventListener('click', async (event) => {
      if (event.target === manager || event.target.closest('[data-cms-close]')) {
        manager.style.display = 'none';
        return;
      }
      const edit = event.target.closest('[data-edit-id]');
      if (edit) {
        const item = items.find((candidate) => String(candidate.id) === edit.dataset.editId);
        if (!item) return;
        editingId = item.id;
        document.getElementById('cms-id').value = item.id;
        document.getElementById('cms-kind').value = item.kind;
        document.getElementById('cms-title').value = item.title || '';
        document.getElementById('cms-description').value = item.description || '';
        document.getElementById('cms-image').value = item.image_url || '';
        document.getElementById('cms-category').value = item.category || '';
        document.getElementById('cms-unit').value = item.unit || '';
        document.getElementById('cms-price').value = item.price || '';
        document.getElementById('cms-sort').value = item.sort_order || 0;
        document.getElementById('cms-published').checked = item.kind === 'override'
          ? item.details?.hidden !== true
          : isPublished(item);
        eligibleTargets(item.page);
        document.getElementById('cms-target').value = item.target_key || '';
        updateFieldVisibility();
        return;
      }
      const remove = event.target.closest('[data-delete-id]');
      if (remove) {
        const item = items.find((candidate) => String(candidate.id) === remove.dataset.deleteId);
        if (!item || !window.confirm(`Delete "${item.title || item.target_key}"? This cannot be undone.`)) return;
        try {
          await request(`/admin/content/${item.id}`, { method: 'DELETE' });
          await refreshEditor();
          await loadPageContent();
          showNotice('Content deleted');
        } catch (deleteError) {
          document.getElementById('cms-error').textContent = deleteError.message;
        }
      }
    });
    resetForm();
  }

  async function init() {
    try {
      await loadPageContent();
    } catch (error) {
      showNotice(error.message, true);
    }
    try {
      const { user } = await request('/auth/me');
      staff = user.role === 'admin' || user.role === 'coach';
    } catch (_error) {
      return;
    }
    if (!staff) return;
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.textContent = 'Edit this page';
    editButton.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:9999;background:#d4a853;color:#111827;border:0;border-radius:999px;padding:12px 18px;font-weight:700;box-shadow:0 6px 24px #0008;cursor:pointer';
    editButton.addEventListener('click', async () => {
      const manager = document.getElementById('cms-manager');
      manager.style.display = 'flex';
      document.getElementById('cms-page').value = currentPage;
      try {
        await refreshEditor();
        await loadPageContent();
      } catch (error) {
        document.getElementById('cms-error').textContent = error.message;
      }
    });
    document.body.append(editButton);
    document.body.insertAdjacentHTML('beforeend', `<style id="cms-styles">@media(max-width:720px){#cms-manager>section>div{grid-template-columns:1fr!important}}</style>${editorMarkup()}`);
    bindEditor();
    if (new URLSearchParams(location.search).get('cms') === '1') {
      editButton.click();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
