const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

test('legacy two-category database migrates to Car without losing records or foreign keys', () => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-migration-'));
  const legacy = new Database(path.join(storage, 'showroom.sqlite'));
  legacy.pragma('foreign_keys = ON');
  legacy.exec(`
    CREATE TABLE admins (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('OWNER','ADMIN')),
      active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, last_login_at TEXT
    );
    CREATE TABLE vehicles (
      id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL CHECK(category IN ('SCOOTER','MOTORCYCLE')),
      brand TEXT NOT NULL, model TEXT NOT NULL, variant TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
      colours_json TEXT NOT NULL DEFAULT '[]', specs_json TEXT NOT NULL DEFAULT '{}', engine_cc INTEGER,
      ex_showroom_price REAL, price_verified INTEGER NOT NULL DEFAULT 0, availability TEXT NOT NULL DEFAULT 'ASK',
      stock_quantity INTEGER, image_path TEXT, published INTEGER NOT NULL DEFAULT 0, featured INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE enquiries (
      id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK(type IN ('GENERAL','TEST_RIDE','FINANCE','EXCHANGE')),
      name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, vehicle_id TEXT,
      preferred_contact TEXT NOT NULL DEFAULT 'PHONE', message TEXT NOT NULL DEFAULT '',
      consent_at TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'website', status TEXT NOT NULL DEFAULT 'NEW',
      assigned_to TEXT, next_follow_up TEXT, internal_notes TEXT NOT NULL DEFAULT '', visit_confirmed_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
      FOREIGN KEY(assigned_to) REFERENCES admins(id) ON DELETE SET NULL
    );
  `);
  const created = '2025-01-01T00:00:00.000Z';
  legacy.prepare('INSERT INTO admins(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)')
    .run('owner-1', 'owner@example.invalid', 'Owner', 'not-used-in-test', 'OWNER', created);
  legacy.prepare('INSERT INTO vehicles(id,slug,category,brand,model,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .run('vehicle-1', 'legacy-scooty', 'SCOOTER', 'Verified make', 'Legacy model', created, created);
  legacy.prepare('INSERT INTO enquiries(id,type,name,phone,vehicle_id,consent_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .run('enquiry-1', 'GENERAL', 'Customer', '9876543210', 'vehicle-1', created, created, created);
  legacy.close();

  const previousStorage = process.env.STORAGE_DIR;
  process.env.STORAGE_DIR = storage;
  let db;
  try {
    db = require('../src/db').db;
    const migrated = db.prepare('SELECT id,category,condition,brand,model FROM vehicles WHERE id=?').get('vehicle-1');
    assert.deepEqual(migrated, {
      id: 'vehicle-1', category: 'SCOOTER', condition: 'NEW', brand: 'Verified make', model: 'Legacy model',
    });
    assert.equal(db.prepare('SELECT count(*) AS n FROM admins WHERE id=?').get('owner-1').n, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM enquiries WHERE id=? AND vehicle_id=?').get('enquiry-1', 'vehicle-1').n, 1);
    assert.match(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='vehicles'").get().sql, /'CAR'/);
    db.prepare('INSERT INTO vehicles(id,slug,category,condition,brand,model,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
      .run('car-1', 'verified-car', 'CAR', 'PRE_OWNED', 'Verified make', 'Verified car', '2026-10-20T00:00:00.000Z', '2026-10-20T00:00:00.000Z');
    assert.equal(db.prepare('SELECT category,condition FROM vehicles WHERE id=?').get('car-1').category, 'CAR');
    assert.equal(db.prepare('SELECT category,condition FROM vehicles WHERE id=?').get('car-1').condition, 'PRE_OWNED');
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally {
    db?.close();
    if (previousStorage === undefined) delete process.env.STORAGE_DIR;
    else process.env.STORAGE_DIR = previousStorage;
    fs.rmSync(storage, { recursive: true, force: true });
  }
});
