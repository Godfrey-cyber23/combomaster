const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../src/config');

async function withServer(callback) {
  const { app } = require('../server');
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test('backend entry point is configured', () => {
  const server = require('../server');

  assert.equal(typeof server.app, 'function');
  assert.equal(typeof server.start, 'function');
});

test('unknown API routes return a JSON 404', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/not-a-route`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'API route not found' });
  });
});

test('the Node server serves auth and dashboard pages with the shared API client', async () => {
  await withServer(async (baseUrl) => {
    for (const page of [
      'login.html', 'signup.html', 'client-dashboard.html', 'admin-dashboard.html',
      'index.html', 'about.html', 'services.html', 'membership.html',
      'mealplans.html', 'shop.html', 'payment-result.html', 'transformations.html', 'contact.html'
    ]) {
      const response = await fetch(`${baseUrl}/${page}`);
      assert.equal(response.status, 200, `${page} should be served`);
      const html = await response.text();
      if (['login.html', 'signup.html', 'client-dashboard.html', 'admin-dashboard.html'].includes(page)) {
        assert.match(html, /assets\/js\/api\.js/, `${page} should load the shared API client`);
      }
      if (['index.html', 'about.html', 'services.html', 'membership.html', 'mealplans.html', 'shop.html', 'transformations.html', 'contact.html'].includes(page)) {
        assert.match(html, /assets\/js\/site-cms\.js/, `${page} should load site content management`);
      }
      assert.doesNotMatch(html, /api\/auth_guard\.js/, `${page} should not depend on the legacy PHP guard`);
    }
    const navbar = await (await fetch(`${baseUrl}/components/navbar.html`)).text();
    assert.equal((navbar.match(/data-cart-trigger/g) || []).length, 2, 'desktop and mobile navigation should show the cart');
    assert.match(navbar, /data-lucide="shopping-cart"/, 'navigation cart should use a trolley icon');
    assert.doesNotMatch(navbar, /NEW MEMBER SPECIAL/, 'navigation should not show the promotional banner');
  });
});

test('shop checkout is unavailable until Flutterwave is configured', {
  skip: Boolean(config.flutterwaveSecretKey && config.flutterwaveWebhookSecretHash && config.publicAppUrl)
}, async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/payments/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /Flutterwave checkout is not configured/);
  });
});

test('payment status rejects malformed order references without querying the database', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/payments/not-an-order-reference`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Order not found.' });
  });
});

test('content management requires an authenticated staff account', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/content?page=shop`);
    assert.equal(response.status, config.sessionConfigured ? 401 : 503);
    assert.deepEqual(await response.json(), {
      error: config.sessionConfigured ? 'Authentication required' : 'Authentication is not configured'
    });
  });
});

test('public content API validates page keys before querying the database', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/content/not-a-site-page`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Content page not found' });
  });
});

test('uploaded media cannot be addressed with an invalid filename', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/media/not-a-valid-image.png`);
    assert.equal(response.status, 404);
  });
});

test('client dashboard API rejects requests without an authenticated session', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/client/dashboard`);
    assert.equal(response.status, config.sessionConfigured ? 401 : 503);
  });
});

test('logout clears the session cookie without requiring a database', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST' });
    assert.equal(response.status, 204);
    assert.match(response.headers.get('set-cookie'), new RegExp(`${config.sessionName}=;.*Expires=Thu, 01 Jan 1970`));
  });
});
