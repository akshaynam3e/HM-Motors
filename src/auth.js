const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { db, now, audit } = require('./db');

const csrfToken = (req) => {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(32).toString('base64url');
  return req.session.csrf;
};
function requireCsrf(req, res, next) {
  const supplied = req.get('x-csrf-token') || req.body?._csrf;
  const expected = req.session?.csrf || '';
  const ok = typeof supplied === 'string' && typeof expected === 'string' && supplied.length === expected.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  if (!ok) return res.status(403).json({ error: 'Security token expired. Refresh the page and try again.' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session?.adminId) return res.status(401).json({ error: 'Please sign in to continue.' });
  const user = db.prepare('SELECT id,email,name,role,active,auth_version FROM admins WHERE id=?').get(req.session.adminId);
  if (!user || !user.active || user.auth_version !== req.session.authVersion) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'This account is inactive. Contact the owner.' });
  }
  req.admin = user;
  next();
}
const requireOwner = (req, res, next) => req.admin?.role === 'OWNER' ? next() : res.status(403).json({ error: 'Only the owner can perform this action.' });
async function verifyPassword(password, hash) { return bcrypt.compare(password, hash); }
async function hashPassword(password) { return bcrypt.hash(password, 12); }
async function login(req, email, password) {
  const admin = db.prepare('SELECT id,email,name,role,password_hash,active,auth_version FROM admins WHERE email=? COLLATE NOCASE').get(email);
  if (!admin || !admin.active || !(await verifyPassword(password, admin.password_hash))) return null;
  await new Promise((resolve, reject) => req.session.regenerate((err) => err ? reject(err) : resolve()));
  req.session.adminId = admin.id;
  req.session.authVersion = admin.auth_version;
  req.session.csrf = crypto.randomBytes(32).toString('base64url');
  db.prepare('UPDATE admins SET last_login_at=? WHERE id=?').run(now(), admin.id);
  audit(admin.id, 'LOGIN', 'admin', admin.id);
  return { id: admin.id, email: admin.email, name: admin.name, role: admin.role };
}
module.exports = { csrfToken, requireCsrf, requireAdmin, requireOwner, hashPassword, verifyPassword, login };
