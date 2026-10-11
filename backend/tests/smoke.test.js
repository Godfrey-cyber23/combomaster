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
    for (const page of ['login.html', 'signup.html', 'client-dashboard.html', 'admin-dashboard.html']) {
      const response = await fetch(`${baseUrl}/${page}`);
      assert.equal(response.status, 200, `${page} should be served`);
      const html = await response.text();
      assert.match(html, /assets\/js\/api\.js/, `${page} should load the shared API client`);
      assert.doesNotMatch(html, /api\/auth_guard\.js/, `${page} should not depend on the legacy PHP guard`);
    }
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
