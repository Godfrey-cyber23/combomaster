const crypto = require('node:crypto');
const express = require('express');
const config = require('../config');
const { getCollection, getDocument, getFirestore, listDocuments } = require('../firestore');

const router = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const referencePattern = /^[0-9a-f-]{36}$/i;
const currency = 'ZMW';
const flutterwaveApi = 'https://api.flutterwave.com/v3';

router.use((_request, response, next) => {
  response.setHeader('Cache-Control', 'no-store');
  next();
});

function isConfigured() {
  if (!config.flutterwaveSecretKey || !config.flutterwaveWebhookSecretHash) return false;
  try {
    const appUrl = new URL(config.publicAppUrl);
    return (appUrl.protocol === 'https:' ||
      (config.nodeEnv !== 'production' && appUrl.hostname === 'localhost')) &&
      !appUrl.username && !appUrl.password && !appUrl.search && !appUrl.hash;
  } catch (_error) {
    return false;
  }
}

function parsePrice(value) {
  const match = typeof value === 'string' &&
    value.trim().match(/^(?:K\s*)?(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const amount = Number(`${match[1].replace(/,/g, '')}${match[2] ? `.${match[2]}` : ''}`);
  return Number.isSafeInteger(Math.round(amount * 100)) && amount > 0 ? amount : null;
}

function validWebhookSecret(header) {
  if (typeof header !== 'string') return false;
  const received = Buffer.from(header);
  const expected = Buffer.from(config.flutterwaveWebhookSecretHash);
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

async function flutterwaveRequest(path, options = {}) {
  const response = await fetch(`${flutterwaveApi}${path}`, {
    ...options,
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${config.flutterwaveSecretKey}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  let body;
  try {
    body = await response.json();
  } catch (_error) {
    throw new Error('Flutterwave returned an invalid response');
  }
  if (!response.ok || body.status !== 'success') {
    throw new Error(`Flutterwave request failed (${response.status})`);
  }
  return body.data;
}

async function updateOrderFromTransaction(transactionId, reference) {
  const orderRef = getDocument('shop_orders', reference);
  const order = await orderRef.get();
  if (!order.exists) return 'not_found';

  const transaction = await flutterwaveRequest(
    `/transactions/${encodeURIComponent(transactionId)}/verify`
  );
  if (transaction.tx_ref !== reference || String(transaction.id) !== String(transactionId)) {
    console.warn('[payments] Flutterwave verification returned a mismatched transaction.');
    return 'pending';
  }
  if (transaction.currency !== currency) {
    await setOrderStatus(reference, 'failed');
    return 'failed';
  }

  const expectedCents = Math.round(Number(order.get('amount')) * 100);
  const paidCents = Math.round(Number(transaction.amount) * 100);
  if (transaction.status !== 'successful') {
    if (!['failed', 'cancelled'].includes(String(transaction.status).toLowerCase())) {
      return 'pending';
    }
    await setOrderStatus(reference, 'failed');
    return 'failed';
  }
  if (paidCents !== expectedCents) {
    await setOrderStatus(reference, 'failed');
    return 'failed';
  }

  await getFirestore().runTransaction(async (transactionUpdate) => {
    const current = await transactionUpdate.get(orderRef);
    if (current.exists && current.get('status') !== 'successful') {
      transactionUpdate.update(orderRef, {
        status: 'successful', flutterwave_transaction_id: String(transaction.id), updated_at: new Date()
      });
    }
  });
  return 'successful';
}

async function setOrderStatus(reference, status) {
  const orderRef = getDocument('shop_orders', reference);
  await getFirestore().runTransaction(async (transaction) => {
    const order = await transaction.get(orderRef);
    if (order.exists && order.get('status') !== 'successful') {
      transaction.update(orderRef, { status, updated_at: new Date() });
    }
  });
}

router.post('/checkout', async (request, response) => {
  if (!isConfigured()) {
    return response.status(503).json({
      error: 'Flutterwave checkout is not configured. Contact the store for assistance.'
    });
  }

  const customer = request.body.customer;
  const name = typeof customer?.name === 'string' ? customer.name.trim() : '';
  const email = typeof customer?.email === 'string' ? customer.email.trim().toLowerCase() : '';
  const phone = typeof customer?.phone === 'string' ? customer.phone.trim() : '';
  const method = request.body.payment_method;
  const requestedItems = request.body.items;

  if (name.length < 2 || name.length > 100 || !emailPattern.test(email) || email.length > 254 ||
      phone.length > 32 || (phone && (!/^[+\d\s()-]{7,32}$/.test(phone) ||
        phone.replace(/\D/g, '').length < 7)) ||
      (method === 'mobile' && !phone) ||
      !['card', 'mobile'].includes(method) || !Array.isArray(requestedItems) ||
      requestedItems.length < 1 || requestedItems.length > 20) {
    return response.status(400).json({ error: 'Enter valid checkout details and cart items.' });
  }

  const quantities = new Map();
  for (const item of requestedItems) {
    if (!item || typeof item.name !== 'string' || item.name.length > 160 ||
        !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99 ||
        quantities.has(item.name)) {
      return response.status(400).json({ error: 'Cart items are invalid.' });
    }
    quantities.set(item.name, item.quantity);
  }

  const names = [...quantities.keys()];
  const catalog = await listDocuments('site_content', {
    filters: [['page_key', '==', 'shop'], ['kind', '==', 'product']], limit: 500
  });
  const products = catalog.filter((product) => product.is_published && quantities.has(product.title));
  if (products.length !== names.length ||
      new Set(products.map((product) => product.title)).size !== products.length) {
    return response.status(400).json({ error: 'One or more cart products are unavailable. Refresh the shop and try again.' });
  }

  const items = products.map((product) => {
    const unitPrice = parsePrice(product.price);
    if (unitPrice === null) return null;
    const quantity = quantities.get(product.title);
    return {
      product_id: product.id,
      title: product.title,
      category: product.category,
      unit: product.unit,
      unit_price: unitPrice,
      quantity,
      subtotal: Math.round(unitPrice * quantity * 100) / 100
    };
  });
  if (items.some((item) => !item)) {
    return response.status(400).json({
      error: 'A product has an invalid price. Please contact the store to complete your order.'
    });
  }

  const amount = Math.round(items.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99) {
    return response.status(400).json({ error: 'The order total is outside the supported payment range.' });
  }
  const reference = crypto.randomUUID();
  await getCollection('shop_orders').doc(reference).create({
    tx_ref: reference, customer_name: name, customer_email: email,
    customer_phone: phone || null, payment_method: method, currency, amount, items,
    status: 'pending', flutterwave_transaction_id: null, created_at: new Date(), updated_at: new Date()
  });

  try {
    const appUrl = new URL(config.publicAppUrl);
    const checkout = await flutterwaveRequest('/payments', {
      method: 'POST',
      body: JSON.stringify({
        tx_ref: reference,
        amount: amount.toFixed(2),
        currency,
        redirect_url: new URL('/api/payments/callback', appUrl).toString(),
        payment_options: method === 'card' ? 'card' : 'mobilemoneyzambia',
        customer: { email, name, ...(phone ? { phonenumber: phone } : {}) },
        customizations: {
          title: 'ComboMaster Fitness',
          description: `Order ${reference.slice(0, 8)}`,
          logo: 'https://res.cloudinary.com/xfcqi4ts/image/upload/v1788711230/gym_logo.jpg'
        },
        meta: { order_reference: reference }
      })
    });
    const checkoutUrl = new URL(checkout.link);
    if (checkoutUrl.origin !== 'https://checkout.flutterwave.com') {
      throw new Error('Flutterwave returned an untrusted checkout URL');
    }
    return response.status(201).json({ checkout_url: checkoutUrl.toString(), tx_ref: reference });
  } catch (error) {
    await setOrderStatus(reference, 'failed');
    console.error('[payments] Checkout could not be started:', error.message);
    return response.status(502).json({
      error: 'We could not start checkout. Please try again or contact the store.'
    });
  }
});

router.get('/callback', async (request, response) => {
  const reference = typeof request.query.tx_ref === 'string' ? request.query.tx_ref : '';
  const transactionId = typeof request.query.transaction_id === 'string'
    ? request.query.transaction_id
    : '';
  let status = 'pending';

  if (isConfigured() && referencePattern.test(reference) && /^\d{1,30}$/.test(transactionId)) {
    try {
      status = await updateOrderFromTransaction(transactionId, reference);
    } catch (error) {
      console.error('[payments] Callback verification failed:', error.message);
    }
  }
  const resultUrl = new URL('/payment-result.html', config.publicAppUrl || 'http://localhost');
  if (referencePattern.test(reference)) resultUrl.searchParams.set('tx_ref', reference);
  resultUrl.searchParams.set('status', status);
  return response.redirect(303, resultUrl.toString());
});

router.get('/:reference', async (request, response) => {
  if (!referencePattern.test(request.params.reference)) {
    return response.status(404).json({ error: 'Order not found.' });
  }
  const orderSnapshot = await getDocument('shop_orders', request.params.reference).get();
  if (!orderSnapshot.exists) return response.status(404).json({ error: 'Order not found.' });
  const order = orderSnapshot.data();
  return response.json({
    tx_ref: order.tx_ref,
    status: order.status,
    currency: order.currency,
    amount: Number(order.amount)
  });
});

router.post('/webhook', async (request, response) => {
  if (!isConfigured()) {
    return response.status(503).json({ error: 'Payment notifications are not configured.' });
  }
  if (!validWebhookSecret(request.get('verif-hash'))) {
    return response.status(401).json({ error: 'Invalid webhook signature.' });
  }

  const transaction = request.body.data;
  const reference = transaction?.tx_ref;
  const transactionId = transaction?.id;
  if (request.body.event !== 'charge.completed' || !referencePattern.test(reference || '') ||
      !/^\d{1,30}$/.test(String(transactionId || ''))) {
    return response.status(200).json({ received: true });
  }

  try {
    const status = await updateOrderFromTransaction(String(transactionId), reference);
    if (status === 'not_found') {
      console.warn('[payments] Webhook references an unknown order.');
    }
    return response.status(200).json({ received: true });
  } catch (error) {
    console.error('[payments] Webhook verification failed:', error.message);
    return response.status(500).json({ error: 'Payment notification could not be verified.' });
  }
});

module.exports = router;
