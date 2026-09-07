const $ = id => document.getElementById(id);
const money = cents => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const quantities = new Map([['flat-white', 2]]);
let menu = [], latest, sequence = 0;
const fulfillment = () => document.querySelector('input[name="fulfillment"]:checked').value;

async function api(path, options) {
  const response = await fetch(path, { ...options, signal: AbortSignal.timeout(12000) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'The coffee bar is temporarily unavailable.');
  return body;
}

function render() {
  $('menu').replaceChildren(...menu.map(product => {
    const card = document.createElement('article');
    card.className = 'product';
    // Menu text is controlled by this application's catalog, not user input.
    card.innerHTML = `<div class="product-art ${product.color}"><span>${product.icon}</span><small>THE MEETUP COLLECTION</small></div><div class="product-info"><h3>${product.name}</h3><p>${product.description}</p><div class="product-bottom"><b>${money(product.priceCents)}</b><div class="stepper"><button aria-label="Remove one ${product.name}">−</button><span>${quantities.get(product.id) || 0}</span><button aria-label="Add one ${product.name}">+</button></div></div></div>`;
    const buttons = card.querySelectorAll('button');
    const quantity = quantities.get(product.id) || 0;
    buttons[0].disabled = quantity === 0;
    buttons[1].disabled = quantity === 10;
    buttons.forEach((button, index) => button.onclick = () => {
      quantities.set(product.id, quantity + (index ? 1 : -1)); render(); refreshQuote();
    });
    return card;
  }));
  $('cart').replaceChildren(...menu.filter(item => quantities.get(item.id)).map(item => {
    const row = document.createElement('div'); row.className = 'cart-row';
    row.innerHTML = `<span><b>${quantities.get(item.id)}×</b> ${item.name}</span><span>${money(item.priceCents * quantities.get(item.id))}</span>`;
    return row;
  }));
  $('count').textContent = [...quantities.values()].reduce((a, b) => a + b, 0);
}

async function refreshQuote() {
  const current = ++sequence;
  latest = null;
  $('confirm').disabled = true;
  ['subtotal', 'fee', 'total', 'request'].forEach(id => $(id).textContent = '—');
  const items = [...quantities].filter(([, quantity]) => quantity > 0).map(([id, quantity]) => ({ id, quantity }));
  if (!items.length) { $('status').textContent = 'Your next great idea starts with a coffee. Add one above.'; return; }
  $('status').textContent = 'Calculating your coffee run…';
  try {
    const data = await api('/api/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items, fulfillment: fulfillment() }) });
    if (current !== sequence) return;
    latest = data;
    $('subtotal').textContent = money(data.quote.subtotalCents);
    $('fee').textContent = data.quote.feeCents ? money(data.quote.feeCents) : 'Free';
    $('total').textContent = money(data.quote.totalCents);
    $('request').textContent = data.requestId;
    $('status').textContent = 'Fresh quote. No payment required.';
    $('confirm').disabled = false;
  } catch (error) { if (current === sequence) $('status').textContent = `${error.message} Change an item to retry.`; }
}

document.querySelectorAll('input[name="fulfillment"]').forEach(input => input.onchange = refreshQuote);
$('confirm').onclick = () => {
  if (!latest) return;
  $('status').textContent = `Coffee run confirmed for this visit! ${money(latest.quote.totalCents)} · ${latest.quote.fulfillment}. This is a demo, not a real order.`;
};
$('copy').onclick = async () => {
  if (!latest) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify({ app: 'Cloud Café', url: location.origin, requestId: latest.requestId, fulfillment: latest.quote.fulfillment, totalCents: latest.quote.totalCents }, null, 2));
    $('status').textContent = 'Support details copied. Share them with the coffee bar team.';
  } catch { $('status').textContent = 'Clipboard unavailable. Copy the request ID shown below.'; }
};
try { ({ menu } = await api('/api/menu')); render(); await refreshQuote(); }
catch { $('menu').textContent = 'The coffee bar could not load. Refresh to try again.'; $('status').textContent = 'API connection unavailable.'; }
