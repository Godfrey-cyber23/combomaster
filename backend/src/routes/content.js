const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const config = require('../config');
const { allocateId, getDocument, getFirestore, listDocuments } = require('../firestore');
const { requireAuth, requireStaff } = require('../middleware/auth');
const { products, mealPlans } = require('../content-defaults');

const router = express.Router();
const pages = new Set([
  'index', 'about', 'services', 'membership', 'mealplans', 'shop',
  'transformations', 'contact'
]);
const kinds = new Set(['block', 'override', 'product', 'meal_plan']);
const fileTypes = {
  'image/jpeg': { extension: 'jpg', signature: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  'image/png': { extension: 'png', signature: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  'image/webp': { extension: 'webp', signature: (buffer) => buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' },
  'image/gif': { extension: 'gif', signature: (buffer) => /^GIF8[79]a$/.test(buffer.toString('ascii', 0, 6)) }
};
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }
});

function validatePage(value) {
  return typeof value === 'string' && pages.has(value);
}

function cleanItem(body) {
  const item = {
    page: body.page,
    kind: body.kind,
    target_key: typeof body.target_key === 'string' ? body.target_key : null,
    title: typeof body.title === 'string' ? body.title.trim() : '',
    description: typeof body.description === 'string' ? body.description.trim() : '',
    image_url: typeof body.image_url === 'string' && body.image_url.trim() ? body.image_url.trim() : null,
    category: typeof body.category === 'string' && body.category.trim() ? body.category.trim() : null,
    unit: typeof body.unit === 'string' && body.unit.trim() ? body.unit.trim() : null,
    price: typeof body.price === 'string' && body.price.trim() ? body.price.trim() : null,
    details: body.details && typeof body.details === 'object' && !Array.isArray(body.details) ? body.details : {},
    is_published: body.is_published !== false,
    sort_order: Number.isInteger(body.sort_order) ? body.sort_order : 0
  };

  if (!validatePage(item.page) || !kinds.has(item.kind) ||
      item.title.length > 160 || item.description.length > 5000 ||
      (item.image_url && (!/^(?:\/images\/[a-zA-Z0-9_./-]+|\/api\/media\/[a-f0-9-]+\.(?:jpg|png|webp|gif)|https:\/\/[^\s]+)$/i.test(item.image_url) ||
        item.image_url.includes('..'))) ||
      (item.target_key && !/^(?:text|image)-[a-z0-9-]{1,100}$/.test(item.target_key)) ||
      (item.category && !['supplements', 'attire', 'equipment'].includes(item.category)) ||
      (item.price && item.price.length > 40) || (item.unit && item.unit.length > 120) ||
      Math.abs(item.sort_order) > 100000 ||
      (body.is_published !== undefined && typeof body.is_published !== 'boolean') ||
      (body.sort_order !== undefined && !Number.isInteger(body.sort_order))) {
    return null;
  }
  if ((item.kind === 'product' && (item.page !== 'shop' || !item.category || !item.unit || !item.price)) ||
      (item.kind === 'meal_plan' && item.page !== 'mealplans') ||
      (item.kind === 'override' && (!item.target_key ||
        (!item.description && !item.image_url && body.details?.hidden !== true))) ||
      (item.kind === 'block' && !item.title && !item.description && !item.image_url)) {
    return null;
  }
  return item;
}

async function seedCatalogs() {
  for (const [page, items] of [['shop', products], ['mealplans', mealPlans]]) {
    const db = getFirestore();
    const markerRef = getDocument('site_content_catalogs', page);
    await db.runTransaction(async (transaction) => {
      const marker = await transaction.get(markerRef);
      if (marker.exists) return;
      const counterRef = getDocument('_counters', 'site_content');
      const counter = await transaction.get(counterRef);
      let id = (counter.exists ? Number(counter.get('value')) : 0);
      items.forEach((item, sortOrder) => {
        id += 1;
        transaction.create(getDocument('site_content', id), {
          id, page: item.page, page_key: item.page, kind: item.kind, target_key: null,
          title: item.title, description: item.description || '', image_url: item.imageUrl || null,
          category: item.category || null, unit: item.unit || null, price: item.price || null,
          details: item.details || {}, is_published: true, sort_order: sortOrder,
          created_at: new Date(), updated_at: new Date()
        });
      });
      transaction.set(counterRef, { value: id });
      transaction.create(markerRef, { page_key: page, initialized_at: new Date() });
    });
  }
}

function sortItems(items) {
  return items.sort((a, b) => Number(a.sort_order) - Number(b.sort_order) || Number(a.id) - Number(b.id));
}

router.get('/content/:page', async (request, response) => {
  if (!validatePage(request.params.page)) {
    return response.status(404).json({ error: 'Content page not found' });
  }
  const [records, catalog] = await Promise.all([
    listDocuments('site_content', { filters: [['page_key', '==', request.params.page]], limit: 500 }),
    getDocument('site_content_catalogs', request.params.page).get()
  ]);
  const items = sortItems(records.filter((item) => item.is_published).map((item) => ({ ...item, page: item.page || item.page_key })));
  response.json({ items, managed: catalog.exists });
});

router.use('/admin/content', requireAuth, requireStaff);

router.get('/admin/content', async (request, response) => {
  const page = request.query.page;
  if (!validatePage(page)) {
    return response.status(400).json({ error: 'A valid page must be selected' });
  }
  if (page === 'shop' || page === 'mealplans') await seedCatalogs();
  const items = sortItems(await listDocuments('site_content', {
    filters: [['page_key', '==', page]], limit: 500
  }));
  response.json({ items });
});

router.post('/admin/content', async (request, response) => {
  const item = cleanItem(request.body);
  if (!item) return response.status(400).json({ error: 'Content fields are invalid' });
  const id = await allocateId('site_content');
  const record = {
    id, page_key: item.page, ...item, created_by: Number(request.auth.sub),
    updated_by: Number(request.auth.sub), created_at: new Date(), updated_at: new Date()
  };
  await getDocument('site_content', id).create(record);
  response.status(201).json(record);
});

router.put('/admin/content/:id', async (request, response) => {
  if (!/^\d+$/.test(request.params.id)) {
    return response.status(400).json({ error: 'Content id is invalid' });
  }
  const item = cleanItem(request.body);
  if (!item) return response.status(400).json({ error: 'Content fields are invalid' });
  const contentRef = getDocument('site_content', request.params.id);
  const existing = await contentRef.get();
  if (!existing.exists) return response.status(404).json({ error: 'Content item not found' });
  const record = { ...existing.data(), ...item, page_key: item.page, updated_by: Number(request.auth.sub), updated_at: new Date() };
  await contentRef.set(record);
  response.json(record);
});

router.delete('/admin/content/:id', async (request, response) => {
  if (!/^\d+$/.test(request.params.id)) {
    return response.status(400).json({ error: 'Content id is invalid' });
  }
  const contentRef = getDocument('site_content', request.params.id);
  const existing = await contentRef.get();
  if (!existing.exists) return response.status(404).json({ error: 'Content item not found' });
  await contentRef.delete();
  response.status(204).end();
});

router.post('/admin/uploads', requireAuth, requireStaff, upload.single('image'), async (request, response) => {
  if (!request.file) return response.status(400).json({ error: 'Choose an image to upload' });
  const type = fileTypes[request.file.mimetype];
  if (!type || !type.signature(request.file.buffer)) {
    return response.status(415).json({ error: 'Upload a valid JPEG, PNG, WebP, or GIF image' });
  }
  await fs.mkdir(config.uploadDirectory, { recursive: true });
  const filename = `${crypto.randomUUID()}.${type.extension}`;
  await fs.writeFile(path.join(config.uploadDirectory, filename), request.file.buffer, { flag: 'wx' });
  response.status(201).json({ image_url: `/api/media/${filename}` });
});

router.get('/media/:filename', async (request, response) => {
  const match = /^([a-f0-9-]{36})\.(jpg|png|webp|gif)$/.exec(request.params.filename);
  if (!match) return response.status(404).end();
  const mime = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[match[2]];
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  response.type(mime);
  response.sendFile(request.params.filename, { root: config.uploadDirectory }, (error) => {
    if (error && !response.headersSent) response.status(error.statusCode || 404).end();
  });
});

module.exports = router;
