const admin = require('firebase-admin');
const serviceAccount = require('../functions/service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function checkUser() {
  try {
    const user = await admin.auth().getUserByEmail('lama.548@avance.com');
    console.log('User exists in Auth:', user.uid);
  } catch (error) {
    console.log('User does not exist in Auth or error:', error.message);
  }
  process.exit();
}

checkUser();
