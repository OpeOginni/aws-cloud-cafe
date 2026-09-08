import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';

const server = http.createServer((req, res) => {
  const { createApp } = await import('../server.mjs');
  const wrappedApp = createApp();
  const wrappedReq = new Request(req.url, { method: req.method, headers: req.headers });
  const wrappedRes = new Response();
  
  wrappedApp(req, res);
});

describe('lambda deployment', () => {
  test('Lambda function exports proper handler', () => {
    assert.ok(exports.handler);
    assert.ok(typeof exports.handler === 'function');
  });

  test('Lambda exports menu data', () => {
    assert.ok(exports.menu);
    assert.ok(Array.isArray(exports.menu));
    assert.equal(exports.menu.length, 4);
  });

  test('Lambda exports quoteOrder function', () => {
    assert.ok(exports.quoteOrder);
    assert.ok(typeof exports.quoteOrder === 'function');
  });

  test('Lambda calculates correct pickup pricing', () => {
    const quote = exports.quoteOrder({ fulfillment: 'pickup', items: [{ id: 'flat-white', quantity: 2 }] });
    assert.equal(quote.totalCents, 840);
    assert.equal(quote.feeCents, 0);
  });

  test('Lambda calculates correct delivery pricing', () => {
    const quote = exports.quoteOrder({ fulfillment: 'delivery', items: [{ id: 'flat-white', quantity: 2 }] });
    assert.equal(quote.totalCents, 1330);
    assert.equal(quote.feeCents, 490);
  });

  test('Lambda handles invalid orders', () => {
    assert.throws(() => exports.quoteOrder({ fulfillment: 'invalid' }), TypeError);
    assert.throws(() => exports.quoteOrder({ fulfillment: 'delivery', items: [] }), TypeError);
  });

  test('Lambda maintains menu consistency', () => {
    const flatWhite = exports.menu.find((item) => item.id === 'flat-white');
    assert.ok(flatWhite);
    assert.equal(flatWhite.name, 'Flat white');
    assert.equal(flatWhite.priceCents, 420);
  });
});

await test.run();
