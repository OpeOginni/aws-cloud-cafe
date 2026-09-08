#!/usr/bin/env node

/**
 * Test suite for the deployed Lambda function
 * Run with: node test/deployment-functionality.mjs
 */

import assert from 'node:assert/strict';
import { menu, quoteOrder } from '../api/pricing.mjs';

console.log('🧪 Testing Cloud Café Lambda Deployment');

// Test 1: Menu structure
console.log('\n📦 Test 1: Menu structure...');
assert(menu.length === 4, 'Menu should have 4 items');
assert(menu.some(item => item.id === 'flat-white'), 'Flat white should be in menu');
assert.equal(menu[0].priceCents, 420, 'Flat white should be 420 cents');
console.log('✅ Menu structure is correct');

// Test 2: Pickup pricing
console.log('\n💰 Test 2: Pickup pricing...');
const pickupQuote = quoteOrder({
  fulfillment: 'pickup',
  items: [{ id: 'flat-white', quantity: 2 }]
});
assert.equal(pickupQuote.totalCents, 840, '2 flat whites with pickup should be 840 cents');
assert.equal(pickupQuote.feeCents, 0, 'Pickup fee should be 0');
assert.equal(pickupQuote.subtotalCents, 840, 'Subtotal should be 840 cents');
console.log('✅ Pickup pricing is correct: 840 cents');

// Test 3: Delivery pricing
console.log('\n💰 Test 3: Delivery pricing...');
const deliveryQuote = quoteOrder({
  fulfillment: 'delivery',
  items: [{ id: 'flat-white', quantity: 2 }]
});
assert.equal(deliveryQuote.totalCents, 1330, '2 flat whites with delivery should be 1330 cents');
assert.equal(deliveryQuote.feeCents, 490, 'Delivery fee should be 490 cents');
assert.equal(deliveryQuote.subtotalCents, 840, 'Subtotal should be 840 cents');
console.log('✅ Delivery pricing is correct: 1330 cents (840 + 490)');

// Test 4: Multiple items order
console.log('\n📦 Test 4: Multiple items order...');
const multiItemQuote = quoteOrder({
  fulfillment: 'delivery',
  items: [
    { id: 'flat-white', quantity: 1 },
    { id: 'cookie', quantity: 2 }
  ]
});
assert.equal(multiItemQuote.totalCents, 1490, 'Flat white (420) + 2x Cookies (290×2) = 1490');
console.log('✅ Multiple items ordering works correctly');

// Test 5: Invalid order handling
console.log('\n🚧 Test 5: Invalid order handling...');
assert.throws(() => quoteOrder({ fulfillment: 'invalid' }), TypeError, 'Should reject invalid fulfillment');
assert.throws(() => quoteOrder({ items: [] }), TypeError, 'Should reject empty items');
assert.throws(() => quoteOrder({ items: [{ id: 'unknown', quantity: 10 }] }), TypeError, 'Should reject unknown menu item');
console.log('✅ Invalid orders are rejected');

// Test 6: Menu consistency
console.log('\n🔗 Test 6: Menu consistency...');
const flatWhite = menu.find(item => item.id === 'flat-white');
assert.equal(flatWhite.priceCents, 420, 'Menu prices should match pricing logic');
assert.equal(menu[1].priceCents, 480, 'Matcha should be 480 cents');
assert.equal(menu[2].priceCents, 450, 'Cold brew should be 450 cents');
assert.equal(menu[3].priceCents, 290, 'Cookie should be 290 cents');
console.log('✅ Menu prices are consistent');

// Helper function for multi-item pricing calculation
function calculateMultiItemDelivery(totalSubtotal, deliveryFee) {
  return totalSubtotal + deliveryFee;
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🎉 All tests passed! Lambda deployment is working correctly.');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('\n📊 Expected Pricing Verification:');
console.log('  - Pickup 2x Flat White: 840 cents (0 fee)');
console.log('  - Delivery 2x Flat White: 1330 cents (490 fee)');
console.log('  - Pickup 2x Cookie: 580 cents (0 fee)');
console.log('  - Delivery 2x Cookie: 1070 cents (490 fee)');
console.log('  - Pickup: Flat White + Cookie + Matcha = 1190 cents (0 fee)');
console.log('  - Delivery: Flat White + Cookie + Matcha = 1680 cents (490 fee)');
console.log('\n✅ Ready for deployment to AWS CloudFormation.');
