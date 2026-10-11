const test = require('node:test');
const assert = require('node:assert/strict');

test('backend entry point is configured', () => {
  const server = require('../server');

  assert.equal(typeof server.app, 'function');
  assert.equal(typeof server.start, 'function');
});
