const express = require('express');
const crypto = require('node:crypto');
const { db, now } = require('../db');
const { enquirySchema, parseJson } = require('../validation');
const { requireCsrf } = require('../auth');
const { rateLimit } = require('express-rate-limit');

const router = express.Router();
const formLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many requests. Please wait a while and try again.' } });
const eventLimit = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Please slow down.' } });
const eventTypes = new Set(['call_click','whatsapp_click','vehicle_view','compare_add','offer_click','enquiry_submitted']);

router.get('/vehicles', (req, res) => {
  const slugs = (req.query.slugs || '').toString().split(',').map((v) => v.trim()).filter(Boolean).slice(0, 3);
  if (!slugs.length) return res.json({ vehicles: [] });
  const placeholders = slugs.map(() => '?').join(',');
  const rows = db.prepare(`SELECT id,slug,category,condition,brand,model,variant,description,colours_json,specs_json,engine_cc,ex_showroom_price,price_verified,availability FROM vehicles WHERE published=1 AND slug IN (${placeholders})`).all(...slugs);
  res.set('Cache-Control','public, max-age=60');
  res.json({ vehicles: rows.map((v) => ({ ...v, colours: parseJson(v.colours_json, []), specifications: parseJson(v.specs_json, {}), colours_json: undefined, specs_json: undefined })) });
});

router.post('/enquiries', formLimit, (req, res) => {
  const parsed = enquirySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Check the highlighted fields and submit again.', fields: parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })) });
  const data = parsed.data;
  if (data.website) return res.status(201).json({ ok: true, message: 'Your request has been received.' });
  if (data.type === 'TEST_RIDE' && (!data.preferredDate || !data.preferredTime)) return res.status(400).json({ error: 'Choose a preferred date and time.' });
  if (data.type === 'TEST_RIDE' && data.preferredDate < new Date().toISOString().slice(0,10)) return res.status(400).json({ error: 'Choose a date that has not passed.' });
  let vehicle = null;
  if (data.vehicleId) {
    vehicle = db.prepare('SELECT id FROM vehicles WHERE id=? AND published=1').get(data.vehicleId);
    if (!vehicle) return res.status(400).json({ error: 'That vehicle is no longer listed. Refresh the page and choose another.' });
  }
  if (data.type === 'TEST_RIDE' && !vehicle) return res.status(400).json({ error: 'Choose one of the currently listed vehicles.' });
  const source = typeof req.body.source === 'string' && /^\/(vehicles|new|pre-owned|scooters|motorcycles|cars|offers|contact|finance|exchange|test-ride|enquiry)(?:\/[a-zA-Z0-9-]+)?$/.test(req.body.source) ? req.body.source : '/';
  // Keep every valid customer submission; rate limiting and the honeypot handle spam without suppressing distinct requests.
  const id = crypto.randomUUID(); const timestamp = now();
  const insert = db.transaction(() => {
    db.prepare(`INSERT INTO enquiries(id,type,name,phone,email,vehicle_id,preferred_contact,message,consent_at,source,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,'NEW',?,?)`).run(id,data.type,data.name,data.phone,data.email||null,data.vehicleId||null,data.preferredContact,data.message,timestamp,source,timestamp,timestamp);
    if (data.type === 'TEST_RIDE') db.prepare(`INSERT INTO test_ride_requests(id,enquiry_id,preferred_date,preferred_time,status,created_at,updated_at) VALUES(?,?,?,?,'REQUESTED',?,?)`).run(crypto.randomUUID(),id,data.preferredDate,data.preferredTime,timestamp,timestamp);
  });
  try { insert(); } catch (error) { console.error('Enquiry storage failed:', error.code || error.name); return res.status(503).json({ error: 'We could not save your request right now. Please try again later or contact the showroom.' }); }
  res.status(201).json({ ok:true, message:'Your request has been received. Showroom staff will contact you; test rides require confirmation.', reference:id.slice(0,8).toUpperCase() });
});

router.post('/events', eventLimit, (req, res) => {
  const type = typeof req.body.type === 'string' ? req.body.type : '';
  if (!eventTypes.has(type)) return res.status(400).json({ error:'Unsupported event.' });
  const page = typeof req.body.page === 'string' && /^\/[a-zA-Z0-9/_-]{0,160}$/.test(req.body.page) ? req.body.page : '/';
  const vehicleId = typeof req.body.vehicleId === 'string' && db.prepare('SELECT 1 FROM vehicles WHERE id=? AND published=1').get(req.body.vehicleId) ? req.body.vehicleId : null;
  db.prepare('INSERT INTO analytics_events(id,event_type,page_path,vehicle_id,created_at) VALUES(?,?,?,?,?)').run(crypto.randomUUID(),type,page,vehicleId,now());
  res.status(202).json({ ok:true });
});

router.post('/accept-invite/:token', formLimit, requireCsrf, async (req,res,next) => {
  try {
    const token = req.params.token;
    if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return res.status(400).json({error:'Invitation link is invalid or expired.'});
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const invite = db.prepare('SELECT * FROM admin_invites WHERE token_hash=? AND used_at IS NULL AND expires_at>?').get(hash,now());
    if (!invite) return res.status(400).json({error:'Invitation link is invalid or expired.'});
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const confirm = typeof req.body.confirmPassword === 'string' ? req.body.confirmPassword : '';
    if (password.length < 14 || password.length > 200 || password !== confirm) return res.status(400).json({error:'Use matching passwords of at least 14 characters.'});
    const { hashPassword } = require('../auth');
    const passwordHash = await hashPassword(password); const id=crypto.randomUUID(); const timestamp=now();
    const create=db.transaction(()=>{
      const current=db.prepare('SELECT used_at FROM admin_invites WHERE id=?').get(invite.id);
      if (!current || current.used_at) throw new Error('This invitation has already been used.');
      db.prepare('INSERT INTO admins(id,email,name,password_hash,role,active,created_at) VALUES(?,?,?,?,\'ADMIN\',1,?)').run(id,invite.email,invite.name,passwordHash,timestamp);
      db.prepare('UPDATE admin_invites SET used_at=? WHERE id=?').run(timestamp,invite.id);
      db.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,metadata_json,created_at) VALUES(?,NULL,\'ADMIN_INVITE_ACCEPTED\',\'admin\',?,?,?)').run(crypto.randomUUID(),id,JSON.stringify({role:'ADMIN'}),timestamp);
    });
    try { create(); } catch (err) { if (err.message.includes('UNIQUE')) return res.status(409).json({error:'This administrator account already exists.'}); throw err; }
    res.status(201).json({ok:true,message:'Your administrator account is ready. You can sign in at /admin.'});
  } catch (error) { next(error); }
});

module.exports = router;
