const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const pool = require('../db');
const config = require('../config');
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
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [marker] = await connection.execute(
        'INSERT IGNORE INTO site_content_catalogs (page_key) VALUES (?)',
        [page]
      );
      if (marker.affectedRows) {
        for (const [sortOrder, item] of items.entries()) {
          await connection.execute(
            `INSERT INTO site_content
             (page_key, kind, target_key, title, description, image_url, category, unit, price, details, is_published, sort_order)
             VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
            [
              item.page, item.kind, item.title, item.description || '',
              item.imageUrl || null, item.category || null, item.unit || null,
              item.price || null, JSON.stringify(item.details || {}), sortOrder
            ]
          );
        }
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

router.get('/content/:page', async (request, response) => {
  if (!validatePage(request.params.page)) {
    return response.status(404).json({ error: 'Content page not found' });
  }
  const [items] = await pool.execute(
    `SELECT id, page_key AS page, kind, target_key, title, description, image_url,
       category, unit, price, details, sort_order
     FROM site_content WHERE page_key = ? AND is_published = 1
     ORDER BY sort_order, id`,
    [request.params.page]
  );
  const [catalog] = await pool.execute(
    'SELECT page_key FROM site_content_catalogs WHERE page_key = ? LIMIT 1',
    [request.params.page]
  );
  response.json({ items, managed: catalog.length > 0 });
});

router.use('/admin/content', requireAuth, requireStaff);

router.get('/admin/content', async (request, response) => {
  const page = request.query.page;
  if (!validatePage(page)) {
    return response.status(400).json({ error: 'A valid page must be selected' });
  }
  if (page === 'shop' || page === 'mealplans') await seedCatalogs();
  const [items] = await pool.execute(
    `SELECT id, page_key AS page, kind, target_key, title, description, image_url,
       category, unit, price, details, is_published, sort_order
     FROM site_content WHERE page_key = ? ORDER BY sort_order, id`,
    [page]
  );
  response.json({ items });
});

router.post('/admin/content', async (request, response) => {
  const item = cleanItem(request.body);
  if (!item) return response.status(400).json({ error: 'Content fields are invalid' });
  const [result] = await pool.execute(
    `INSERT INTO site_content
     (page_key, kind, target_key, title, description, image_url, category, unit, price, details, is_published, sort_order, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.page, item.kind, item.target_key, item.title, item.description, item.image_url,
      item.category, item.unit, item.price, JSON.stringify(item.details),
      item.is_published, item.sort_order, request.auth.sub, request.auth.sub
    ]
  );
  response.status(201).json({ id: result.insertId, ...item });
});

router.put('/admin/content/:id', async (request, response) => {
  if (!/^\d+$/.test(request.params.id)) {
    return response.status(400).json({ error: 'Content id is invalid' });
  }
  const item = cleanItem(request.body);
  if (!item) return response.status(400).json({ error: 'Content fields are invalid' });
  const [existing] = await pool.execute('SELECT id FROM site_content WHERE id = ? LIMIT 1', [request.params.id]);
  if (!existing.length) return response.status(404).json({ error: 'Content item not found' });
  const [result] = await pool.execute(
    `UPDATE site_content SET page_key = ?, kind = ?, target_key = ?, title = ?, description = ?,
       image_url = ?, category = ?, unit = ?, price = ?, details = ?, is_published = ?, sort_order = ?, updated_by = ?
     WHERE id = ?`,
    [
      item.page, item.kind, item.target_key, item.title, item.description, item.image_url,
      item.category, item.unit, item.price, JSON.stringify(item.details),
      item.is_published, item.sort_order, request.auth.sub, request.params.id
    ]
  );
  if (!result.affectedRows) {
    response.json({ id: Number(request.params.id), ...item });
    return;
  }
  response.json({ id: Number(request.params.id), ...item });
});

router.delete('/admin/content/:id', async (request, response) => {
  if (!/^\d+$/.test(request.params.id)) {
    return response.status(400).json({ error: 'Content id is invalid' });
  }
  const [result] = await pool.execute('DELETE FROM site_content WHERE id = ?', [request.params.id]);
  if (!result.affectedRows) return response.status(404).json({ error: 'Content item not found' });
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
