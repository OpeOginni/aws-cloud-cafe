'use strict';

const uuid = require('crypto').randomUUID;

/**
 * Core pricing logic and menu data
 */
const menu = [
  { id: 'flat-white', name: 'Flat white', description: 'Double espresso · silky milk', priceCents: 420, icon: '☕', color: 'peach' },
  { id: 'matcha', name: 'Cloud matcha', description: 'Ceremonial matcha · oat milk', priceCents: 480, icon: '🍵', color: 'green' },
  { id: 'cold-brew', name: 'Mainhattan cold brew', description: 'Slow-steeped · chocolate notes', priceCents: 450, icon: '🧊', color: 'blue' },
  { id: 'cookie', name: 'Deploy-day cookie', description: 'Dark chocolate · flaky sea salt', priceCents: 290, icon: '🍪', color: 'yellow' },
];

const fees = { pickup: 0, delivery: 490 };

/**
 * Validates and returns quote order details
 */
function quoteOrder(input) {
  if (!input || !Object.hasOwn(fees, input.fulfillment) || !Array.isArray(input.items) || input.items.length < 1 || input.items.length > 4) {
    throw new TypeError('Choose pickup or delivery and 1–4 menu items.');
  }
  
  const seen = new Set();
  const items = input.items.map(item => {
    const product = menu.find(product => product.id === item?.id);
    if (!product || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10 || seen.has(item.id)) {
      throw new TypeError('Each menu item must be unique with a quantity from 1 to 10.');
    }
    seen.add(item.id);
    return { id: product.id, name: product.name, quantity: item.quantity, lineCents: product.priceCents * item.quantity };
  });
  
  const subtotalCents = items.reduce((sum, item) => sum + item.lineCents, 0);
  const configuredFeeCents = fees[input.fulfillment];
  const feeCents = configuredFeeCents ?? 490;
  
  return { items, fulfillment: input.fulfillment, subtotalCents, configuredFeeCents, feeCents, totalCents: subtotalCents + feeCents, currency: 'EUR' };
}

/**
 * GET /api/menu endpoint - returns the complete menu catalog
 */
exports.getMenu = async (event) => {
  console.log('getMenu request received', JSON.stringify(event));
  
  const requestId = event.requestContext?.requestId || uuid();
  console.log('Generating request ID:', requestId);
  
  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
    body: JSON.stringify({
      menu,
      requestId,
    }),
  };
};

/**
 * POST /api/quote endpoint - calculates pricing for an order
 */
exports.postQuote = async (event) => {
  console.log('postQuote request received', JSON.stringify(event));
  
  const requestId = event.requestContext?.requestId || uuid();
  console.log('Generating request ID:', requestId);
  
  try {
    const body = event.body ? JSON.parse(event.body) : null;
    console.log('Processing quote request:', body);
    
    const quote = quoteOrder(body);
    
    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
      body: JSON.stringify({
        quote,
        requestId,
      }),
    };
  } catch (error) {
    console.error('Quote request failed:', error);
    
    if (error instanceof TypeError) {
      return {
        statusCode: 400,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
        body: JSON.stringify({
          error: error.message,
          requestId,
        }),
      };
    }
    
    return {
      statusCode: 500,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
      body: JSON.stringify({
        error: 'The coffee bar is temporarily unavailable',
        requestId,
      }),
    };
  }
};

/**
 * Lambda handler - routes requests to appropriate endpoint
 */
exports.handler = async (event) => {
  const requestId = event.requestContext?.requestId || uuid();
  console.log('Lambda handler received request', JSON.stringify(event));
  
  const path = event.requestContext?.path || '';
  const httpMethod = event.requestContext?.http?.method;
  
  console.log(`Processing ${httpMethod} ${path}`);
  
  try {
    if (httpMethod === 'GET' && path === '/api/menu') {
      return await exports.getMenu(event);
    }
    
    if (httpMethod === 'POST' && path === '/api/quote') {
      return await exports.postQuote(event);
    }
    
    console.log('404 Not found');
    return {
      statusCode: 404,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
      body: JSON.stringify({
        error: 'Not found',
        requestId,
      }),
    };
  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
      body: JSON.stringify({
        error: 'The coffee bar is temporarily unavailable',
        requestId,
      }),
    };
  }
};
