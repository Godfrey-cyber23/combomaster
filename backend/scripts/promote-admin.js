const { getCollection } = require('../src/firestore');

async function promoteAdmin() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Usage: npm --prefix backend run admin:promote -- admin@example.com');
  }
  const users = await getCollection('users').where('email', '==', email).limit(1).get();
  if (users.empty) throw new Error('No account found. Register through the signup page first.');
  await users.docs[0].ref.update({ role: 'admin', updated_at: new Date() });
  console.log('Administrator role assigned.');
}

promoteAdmin().catch((error) => {
  console.error('Could not promote administrator:', error.message);
  process.exitCode = 1;
});
