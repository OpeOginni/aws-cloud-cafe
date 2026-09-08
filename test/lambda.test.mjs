# Lambda Handler Test

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { menu, quoteOrder } = require('./api/pricing.mjs');

test('menu contains expected items', () => {
  assert(menu.length === 4);
  assert.match(menu.find(item => item.id === 'flat-white').name, /flat white/i);
});

test('pickup uses server-side prices', () => {
  const quote = quoteOrder({ fulfillment: 'pickup', items: [{ id: 'flat-white', quantity: 2 }] });
  assert.equal(quote.subtotalCents, 840);
  assert.equal(quote.feeCents, 0);
  assert.equal(quote.totalCents, 840);
});

test('delivery uses server-side prices and integer cents', () => {
  const quote = quoteOrder({ fulfillment: 'delivery', items: [{ id: 'flat-white', quantity: 2 }] });
  assert.equal(quote.subtotalCents, 840);
  assert.equal(quote.feeCents, 490);
  assert.equal(quote.totalCents, 1330);
});

test('invalid orders are rejected', () => {
  assert.throws(() => quoteOrder({ fulfillment: 'missing' }), TypeError);
  assert.throws(() => quoteOrder({ fulfillment: 'delivery', items: [] }), TypeError);
  assert.throws(() => quoteOrder({ fulfillment: 'pickup', items: [] }), TypeError);
  assert.throws(() => quoteOrder({ fulfillment: 'delivery', items: [{ id: 'flat-white', quantity: 2 }], foo: 'bar' }), TypeError);
});
