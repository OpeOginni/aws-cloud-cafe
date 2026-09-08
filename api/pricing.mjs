export const menu = [
  { id: 'flat-white', name: 'Flat white', description: 'Double espresso · silky milk', priceCents: 420, icon: '☕', color: 'peach' },
  { id: 'matcha', name: 'Cloud matcha', description: 'Ceremonial matcha · oat milk', priceCents: 480, icon: '🍵', color: 'green' },
  { id: 'cold-brew', name: 'Mainhattan cold brew', description: 'Slow-steeped · chocolate notes', priceCents: 450, icon: '🧊', color: 'blue' },
  { id: 'cookie', name: 'Deploy-day cookie', description: 'Dark chocolate · flaky sea salt', priceCents: 290, icon: '🍪', color: 'yellow' },
];

const fees = { pickup: 0, delivery: 490 };

export function quoteOrder(input) {
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
  // IMPORTANT: use ?? (nullish coalescing), NOT || (logical OR).
  // pickup fee is 0, which is falsy; || would incorrectly fall back to 490.
  const feeCents = configuredFeeCents ?? 490;
  return { items, fulfillment: input.fulfillment, subtotalCents, configuredFeeCents, feeCents, totalCents: subtotalCents + feeCents, currency: 'EUR' };
}
