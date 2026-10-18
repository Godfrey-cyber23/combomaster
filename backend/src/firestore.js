const fs = require('node:fs');
const { cert, initializeApp } = require('firebase-admin/app');
const { getFirestore: createFirestore } = require('firebase-admin/firestore');
const config = require('./config');

let firestore = null;
let initializationError = null;

if (config.firebaseServiceAccountPath) {
  try {
    const serviceAccount = JSON.parse(fs.readFileSync(config.firebaseServiceAccountPath, 'utf8'));
    const app = initializeApp({
      credential: cert(serviceAccount),
      projectId: config.firebaseProjectId || serviceAccount.project_id
    });
    firestore = createFirestore(app, config.firebaseDatabaseId);
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

function documentData(snapshot) {
  return snapshot.exists ? { id: Number(snapshot.id), ...normalizeValue(snapshot.data()) } : null;
}

function normalizeValue(value) {
  if (value && typeof value.toDate === 'function') return value.toDate();
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, normalizeValue(nested)]));
  }
  return value;
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
  orderBy.forEach(([field, direction = 'asc']) => { query = query.orderBy(field, direction); });
  if (limit) query = query.limit(limit);
  const snapshot = await query.get();
  return snapshot.docs.map((document) => documentData(document));
}

module.exports = { allocateId, documentData, getCollection, getDocument, getFirestore, listDocuments, normalizeValue };
