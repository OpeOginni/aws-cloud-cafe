import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server.mjs';
import { quoteOrder } from '../api/pricing.mjs';

const server = createApp();
let origin;
before(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

test('delivery uses server-side prices and integer cents', () => {
  const quote = quoteOrder({ fulfillment: 'delivery', items: [{ id: 'flat-white', quantity: 2, priceCents: 1 }] });
  assert.equal(quote.subtotalCents, 840);
  assert.equal(quote.feeCents, 490);
  assert.equal(quote.totalCents, 1330);
});

test('pickup has no fee', () => {
  const quote = quoteOrder({ fulfillment: 'pickup', items: [{ id: 'flat-white', quantity: 2 }] });
  assert.equal(quote.subtotalCents, 840);
  assert.equal(quote.feeCents, 0);
  assert.equal(quote.totalCents, 840);
});

test('invalid orders are rejected', () => {
  for (const input of [null, {}, { fulfillment: 'toString', items: [{}] }, { fulfillment: 'pickup', items: [] },
    { fulfillment: 'pickup', items: [{ id: 'cookie', quantity: -1 }] },
    { fulfillment: 'pickup', items: [{ id: 'cookie', quantity: 1.5 }] },
    { fulfillment: 'pickup', items: [{ id: 'cookie', quantity: 11 }] },
    { fulfillment: 'pickup', items: [{ id: 'unknown', quantity: 1 }] },
    { fulfillment: 'pickup', items: [{ id: 'cookie', quantity: 1 }, { id: 'cookie', quantity: 1 }] }]) {
    assert.throws(() => quoteOrder(input), TypeError);
  }
});

test('website and menu are served by the Node server', async () => {
  for (const path of ['/', '/app.js', '/style.css']) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200);
    assert.ok((await response.text()).length > 0);
  }
  const response = await fetch(origin + '/api/menu');
  const data = await response.json();
  assert.equal(data.menu.length, 4);
  assert.equal(data.requestId, response.headers.get('x-request-id'));
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('quote endpoint returns a priced order and support request ID', async () => {
  const response = await fetch(origin + '/api/quote', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fulfillment: 'delivery', items: [{ id: 'cookie', quantity: 1 }] }),
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.quote.totalCents, 780);
  assert.equal(data.requestId, response.headers.get('x-request-id'));
});

test('bad JSON, invalid orders, oversized bodies, and unknown routes fail clearly', async () => {
  for (const [body, status] of [['{', 400], ['{}', 400], ['x'.repeat(4097), 413]]) {
    const response = await fetch(origin + '/api/quote', { method: 'POST', body });
    assert.equal(response.status, status);
    assert.ok((await response.json()).error);
  }
  const response = await fetch(origin + '/not-a-route');
  assert.equal(response.status, 404);
});
