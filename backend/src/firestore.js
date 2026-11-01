const fs = require('node:fs');
const { cert, initializeApp, getApps } = require('firebase-admin/app');
const { getAuth: createAuth } = require('firebase-admin/auth');
const { getFirestore: createFirestore } = require('firebase-admin/firestore');
const config = require('./config');

let firestore = null;
let adminAuth = null;
let initializationError = null;

if (config.firebaseServiceAccountPath) {
  try {
    const serviceAccount = JSON.parse(fs.readFileSync(config.firebaseServiceAccountPath, 'utf8'));
    // Reuse an existing app if one was already initialized (hot reload safety).
    const app = getApps().length
      ? getApps()[0]
      : initializeApp({
          credential: cert(serviceAccount),
          projectId: config.firebaseProjectId || serviceAccount.project_id
        });
    firestore = createFirestore(app, config.firebaseDatabaseId);
    adminAuth = createAuth(app);
  } catch (error) {
    initializationError = error;
  }
}

function getFirestore() {
  if (!firestore) {
    const error = new Error(initializationError
      ? 'Firestore credentials are invalid or could not be loaded'
      : 'Firestore is not configured');
    error.status = 503;
    error.cause = initializationError;
    throw error;
  }
  return firestore;
}

function getAuth() {
  if (!adminAuth) {
    const error = new Error(initializationError
      ? 'Firebase Auth credentials are invalid or could not be loaded'
      : 'Firebase Auth is not configured');
    error.status = 503;
    error.cause = initializationError;
    throw error;
  }
  return adminAuth;
}

function allocateId(counterName) {
  const db = getFirestore();
  const counter = db.collection('_counters').doc(counterName);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(counter);
    const value = (snapshot.exists ? Number(snapshot.get('value')) : 0) + 1;
    transaction.set(counter, { value });
    return value;
  });
}

function normalizeValue(value) {
  if (value && typeof value.toDate === 'function') return value.toDate();
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, normalizeValue(nested)]));
  }
  return value;
}

function coerceId(id) {
  // Only convert to a number if the doc ID is purely digits.
  return /^\d+$/.test(id) ? Number(id) : id;
}

function documentData(snapshot) {
  return snapshot.exists
    ? { id: coerceId(snapshot.id), ...normalizeValue(snapshot.data()) }
    : null;
}

function getCollection(name) {
  return getFirestore().collection(name);
}

function getDocument(name, id) {
  return getCollection(name).doc(String(id));
}

async function listDocuments(name, { filters = [], orderBy = [], limit = 200 } = {}) {
  let query = getCollection(name);
  filters.forEach(([field, operator, value]) => { query = query.where(field, operator, value); });
  if (limit) query = query.limit(limit);
  const snapshot = await query.get();
  let docs = snapshot.docs.map((document) => documentData(document));
  orderBy.forEach(([field, direction = 'asc']) => {
    docs.sort((a, b) => {
      const av = a[field], bv = b[field];
      if (av === bv) return 0;
      const cmp = av > bv ? 1 : -1;
      return direction === 'desc' ? -cmp : cmp;
    });
  });
  return docs;
}

module.exports = {
  allocateId,
  documentData,
  getAuth,
  getCollection,
  getDocument,
  getFirestore,
  listDocuments,
  normalizeValue
};