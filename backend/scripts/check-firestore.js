const { getFirestore } = require('../src/firestore');

async function checkFirestore() {
  try {
    await getFirestore().collection('_health').limit(1).get();
    console.log('Firestore connection verified.');
  } catch (error) {
    console.error('Firestore connection failed:', error.message);
    process.exitCode = 1;
  }
}

checkFirestore();
