const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

const storageDir = path.resolve(process.env.STORAGE_DIR || './storage');
fs.mkdirSync(storageDir, { recursive: true, mode: 0o700 });
const db = new Database(path.join(storageDir, 'showroom.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
  password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('OWNER','ADMIN')),
  active INTEGER NOT NULL DEFAULT 1, auth_version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, last_login_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_owner_only ON admins(role) WHERE role = 'OWNER';
CREATE TABLE IF NOT EXISTS admin_invites (
  id TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE, name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_by TEXT NOT NULL,
  created_at TEXT NOT NULL, used_at TEXT, FOREIGN KEY(created_by) REFERENCES admins(id)
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, category TEXT NOT NULL CHECK(category IN ('SCOOTER','MOTORCYCLE','CAR')),
  condition TEXT NOT NULL DEFAULT 'NEW' CHECK(condition IN ('NEW','PRE_OWNED')),
  brand TEXT NOT NULL, model TEXT NOT NULL, variant TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
  colours_json TEXT NOT NULL DEFAULT '[]', specs_json TEXT NOT NULL DEFAULT '{}', engine_cc INTEGER,
  ex_showroom_price REAL, price_verified INTEGER NOT NULL DEFAULT 0, availability TEXT NOT NULL DEFAULT 'ASK',
  stock_quantity INTEGER, image_path TEXT, published INTEGER NOT NULL DEFAULT 0, featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS vehicle_public_idx ON vehicles(published, category, featured, brand);
CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', terms TEXT NOT NULL DEFAULT '',
  starts_at TEXT, ends_at TEXT, published INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS enquiries (
  id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK(type IN ('GENERAL','TEST_RIDE','FINANCE','EXCHANGE')),
  name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, vehicle_id TEXT,
  preferred_contact TEXT NOT NULL DEFAULT 'PHONE', message TEXT NOT NULL DEFAULT '',
  consent_at TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'website', status TEXT NOT NULL DEFAULT 'NEW',
  assigned_to TEXT, next_follow_up TEXT, internal_notes TEXT NOT NULL DEFAULT '',
  visit_confirmed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
  FOREIGN KEY(assigned_to) REFERENCES admins(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS enquiries_pipeline_idx ON enquiries(status, type, created_at);
CREATE INDEX IF NOT EXISTS enquiries_followup_idx ON enquiries(next_follow_up, status);
CREATE TABLE IF NOT EXISTS test_ride_requests (
  id TEXT PRIMARY KEY, enquiry_id TEXT NOT NULL UNIQUE, preferred_date TEXT NOT NULL,
  preferred_time TEXT NOT NULL, confirmed_date TEXT, confirmed_time TEXT,
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','CONFIRMED','REJECTED','COMPLETED')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(enquiry_id) REFERENCES enquiries(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS follow_up_events (
  id TEXT PRIMARY KEY, enquiry_id TEXT NOT NULL, admin_id TEXT,
  note TEXT NOT NULL, next_follow_up TEXT, completed_at TEXT NOT NULL,
  FOREIGN KEY(enquiry_id) REFERENCES enquiries(id) ON DELETE CASCADE,
  FOREIGN KEY(admin_id) REFERENCES admins(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS followup_event_date_idx ON follow_up_events(completed_at);
CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY, event_type TEXT NOT NULL, page_path TEXT NOT NULL DEFAULT '/',
  vehicle_id TEXT, created_at TEXT NOT NULL,
  FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS analytics_date_idx ON analytics_events(created_at, event_type);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY, actor_id TEXT, action TEXT NOT NULL, entity_type TEXT NOT NULL,
  entity_id TEXT, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL,
  FOREIGN KEY(actor_id) REFERENCES admins(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS audit_date_idx ON audit_logs(created_at);
`);
const adminColumns = new Set(db.pragma('table_info(admins)').map((column) => column.name));
if (!adminColumns.has('auth_version')) db.exec('ALTER TABLE admins ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 1');
const vehicleColumns = new Set(db.pragma('table_info(vehicles)').map((column) => column.name));
if (!vehicleColumns.has('condition')) db.exec("ALTER TABLE vehicles ADD COLUMN condition TEXT NOT NULL DEFAULT 'NEW' CHECK(condition IN ('NEW','PRE_OWNED'))");
const vehicleTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='vehicles'").get()?.sql || '';
if (!vehicleTableSql.includes("'CAR'")) {
  const fkBefore = new Set(db.pragma('foreign_key_check').map((r) => `${r.table}|${r.rowid}|${r.parent}|${r.fkid}`));
  db.pragma('foreign_keys = OFF');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`CREATE TABLE vehicles_v2 (
      id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL CHECK(category IN ('SCOOTER','MOTORCYCLE','CAR')),
      condition TEXT NOT NULL DEFAULT 'NEW' CHECK(condition IN ('NEW','PRE_OWNED')),
      brand TEXT NOT NULL, model TEXT NOT NULL, variant TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
      colours_json TEXT NOT NULL DEFAULT '[]', specs_json TEXT NOT NULL DEFAULT '{}', engine_cc INTEGER,
      ex_showroom_price REAL, price_verified INTEGER NOT NULL DEFAULT 0, availability TEXT NOT NULL DEFAULT 'ASK',
      stock_quantity INTEGER, image_path TEXT, published INTEGER NOT NULL DEFAULT 0, featured INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`);
    db.exec(`INSERT INTO vehicles_v2(id,slug,category,condition,brand,model,variant,description,colours_json,specs_json,engine_cc,ex_showroom_price,price_verified,availability,stock_quantity,image_path,published,featured,created_at,updated_at)
      SELECT id,slug,category,condition,brand,model,variant,description,colours_json,specs_json,engine_cc,ex_showroom_price,price_verified,availability,stock_quantity,image_path,published,featured,created_at,updated_at FROM vehicles`);
    db.exec('DROP TABLE vehicles');
    db.exec('ALTER TABLE vehicles_v2 RENAME TO vehicles');
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  } finally {
    db.pragma('foreign_keys = ON');
  }
  const addedFkViolations = db.pragma('foreign_key_check').filter((r) => !fkBefore.has(`${r.table}|${r.rowid}|${r.parent}|${r.fkid}`));
  if (addedFkViolations.length) throw new Error(`Vehicle category migration introduced ${addedFkViolations.length} foreign-key violation(s).`);
}
db.exec('CREATE INDEX IF NOT EXISTS vehicle_public_idx ON vehicles(published, category, featured, brand)');
db.exec('CREATE INDEX IF NOT EXISTS vehicle_condition_idx ON vehicles(published, condition, category, featured)');

const now = () => new Date().toISOString();
const defaults = {
  site_name: 'HM Motors', tagline: 'Scooty, bike & car showroom', public_phone: '', public_email: '', whatsapp_number: '',
  address_line: '', locality: 'Bhurkunda', district: 'Ramgarh', state: 'Jharkhand',
  postal_code: '', map_url: '', business_hours: '', public_base_url: '',
  service_enabled: 'false', service_description: '', review_url: '',
  privacy_contact: '', retention_days: '180', low_stock_threshold: '2', stale_listing_days: '30',
  gstin: '', dealership_statement: '', legal_business_name: '',
  privacy_notice: '', terms_notice: '',
};
const getSettings = () => {
  const rows = db.prepare('SELECT key,value FROM settings').all();
  const settings = { ...defaults, ...Object.fromEntries(rows.map((row) => [row.key, row.value])) };
  if (!settings.site_name.trim()) settings.site_name = 'HM Motors';
  return settings;
};
const setSettings = (patch) => {
  const save = db.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at');
  const transaction = db.transaction((entries) => entries.forEach(([key, value]) => save.run(key, String(value), now())));
  transaction(Object.entries(patch));
};
const audit = (actorId, action, entityType, entityId = null, metadata = {}) => {
  db.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(crypto.randomUUID(), actorId || null, action, entityType, entityId, JSON.stringify(metadata), now());
};

module.exports = { db, storageDir, now, getSettings, setSettings, audit };
