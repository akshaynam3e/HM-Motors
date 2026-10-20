const crypto = require('node:crypto');
const { db, now } = require('../src/db');
const { hashPassword } = require('../src/auth');

/**
 * Optional deployment bootstrap: when all OWNER_* variables are set, create the
 * first owner before the HTTP server starts. Never log or persist the plaintext
 * password. The environment values must be configured privately at the host.
 */
async function bootstrapOwnerFromEnvironment() {
  const name = (process.env.OWNER_NAME || '').trim();
  const email = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD || '';
  const supplied = [name, email, password].filter(Boolean).length;

  if (supplied === 0) return false;
  if (supplied !== 3) throw new Error('Set OWNER_NAME, OWNER_EMAIL, and OWNER_PASSWORD together, or leave all three unset.');
  if (name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('OWNER_NAME or OWNER_EMAIL is invalid.');
  }
  if (password.length < 14 || password.length > 200) {
    throw new Error('OWNER_PASSWORD must be 14–200 characters.');
  }

  const owner = db.prepare("SELECT id FROM admins WHERE role='OWNER' LIMIT 1").get();
  if (owner) return false;

  const conflictingAccount = db.prepare('SELECT id FROM admins WHERE email=? COLLATE NOCASE').get(email);
  if (conflictingAccount) throw new Error('OWNER_EMAIL already belongs to a non-owner account; remove the bootstrap variables and resolve this account manually.');

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  db.prepare('INSERT INTO admins(id,email,name,password_hash,role,active,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(id, email, name, passwordHash, 'OWNER', 1, now());
  console.log('Initial owner account provisioned from private environment configuration.');
  return true;
}

module.exports = { bootstrapOwnerFromEnvironment };
